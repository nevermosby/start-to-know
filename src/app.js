var express = require('express');
var path = require('path');
var bodyParser = require('body-parser');
var fs = require('fs');
var request = require('request');
var Docker = require('dockerode');

var flowdock = require('./flowdock.js');

var PORT = 4000;
var app = express();
app.use(bodyParser.json());

app.get('/', function (req, res) {
	res.send('Start to know Service');
});

var LOCAL_DOCKER_HOST = process.env.LOCAL_DOCKER_HOST || '';
var REMOTE_DOCKER_HOST = process.env.REMOTE_DOCKER_HOST || '';
var VIDEO_TRACK_SERVICE = process.env.VIDEO_TRACK_SERVICE || '';

/*
get the video info and post to flowdock
 */
function getVideoByIdAndPost(id, message, callback) {
	console.log('Get video info by id: ' + id);
	var options = {
		uri : VIDEO_TRACK_SERVICE + '/videos/' + id,
		method : 'GET',
		headers : {
			'Accept' : 'application/json'
		}
	};
	request(options, function (error, response, body) {
		if (response.statusCode !== 200) {
			console.log("Failed to get video info by id " + id + ' with error message: ' + JSON.stringify(body));
			return null;
		} else {
			console.log("Got video info: " + JSON.stringify(body));
			body = JSON.parse(body);
			var video = {
				id : body._id,
				url : body.url,
				comments : body.comments,
				title : body.title,
				size : body.file_size,
				path : body.file_path
			};
			console.log("New video info: " + JSON.stringify(video));
			flowdock.post2Inbox(video, message, callback);
		}
	});
}
/*
update the video download status
 */
function afterDownload(video, callback) {
	var options = {
		uri : VIDEO_TRACK_SERVICE + '/videos/update/download/end/' + video.id,
		method : 'PUT',
		json : true,
		body : {
			"file_path" : video.file_path,
			"download_status" : video.download_status,
			"download_msg" : video.download_msg
		}
	};
	request(options, function (error, response, body) {
		if (response.statusCode !== 200) {
			console.log("Failed to update doc for " + video.id + " after download with error message: " + JSON.stringify(body));
		} else {
			console.log("Successfully update for video download: " + video.id);
			console.log("Start to upload");
			beforeUpload(video.id, video.file_path, callback);
		}
	});
}

/*
update the video for after upload
 */
function afterUpload(video_id, callback) {
	var options = {
		uri : VIDEO_TRACK_SERVICE + '/videos/update/upload/end/' + video_id,
		method : 'PUT',
		json : true,
		body : {
			"upload_status" : true,
			"upload_msg" : "complete"
		}
	};
	request(options, function (error, response, body) {
		if (response.statusCode !== 200) {
			console.log("Failed to update doc for " + video_id + " after upload with error message: " + JSON.stringify(body));
		} else {
			console.log("Successfully update for video upload: " + video_id);
			callback();
		}
	});
}

/*
update the video to start upload
 */
function beforeUpload(video_id, video_path, callback) {
	var options = {
		uri : VIDEO_TRACK_SERVICE + '/videos/update/upload/start/' + video_id,
		method : 'PUT',
	};
	request(options, function (error, response, body) {
		if (response.statusCode !== 200) {
			console.log("Failed to update doc for " + video_id + " before upload with error message: " + JSON.stringify(body));
		} else {
			console.log("Successfully update for video upload " + video_id + 'with path ' + video_path);
			callback(video_path);
		}
	});
}

/*
insert the video info into DB before the actual download
 */
function beforeDownload(video, callback) {
	var options = {
		uri : VIDEO_TRACK_SERVICE + '/videos/insert',
		method : 'POST',
		json : true,
		body : {
			"url" : video.url,
			"comments" : video.comments,
			"title" : video.title,
			"file_size" : video.size
		}
	};
	request(options, function (error, response, body) {
		if (response.statusCode !== 200) {
			console.log("Failed to insert doc before download with error message: " + JSON.stringify(body));
		} else {
			console.log("Successfully insert with new id: " + body.id)
			callback(body);
		}
	});
}

/*
read the file to parse the title and size of target video
 */
function parseInfo(filePath) {
	var arr = fs.readFileSync(filePath, 'utf8').toString().split('\r\n');
	title = arr[0].split(':')[1];
	size = arr[1].split(':')[1];
	var result = {
		"title" : title,
		"size" : size
	};
	console.log("video info: " + JSON.stringify(result))
	return result;
}

/*
read the file to parse the path of target video
 */
function parsePath(filePath) {
	var arr = fs.readFileSync(filePath, 'utf8').toString().split('\r\n');
	var lastLog = arr[arr.length - 2];
	console.log("last line of log: " + lastLog)
	var path = lastLog.split(':')[1];
	console.log("video path: " + path)
	return path;
}

app.get('/test', function (req, res) {
	console.log("test mode");
	//parseTitleSizeFromFile("title-size.txt", function () {
	//	res.json("OK");
	//});
	readFileSync('title-size.txt');
	res.json('OK');

});

app.post('/twp/download', function (req, res) {
	var targetUrl = req.body.targetUrl;
	var comments = req.body.comments;
	console.log("Get request to download " + targetUrl + ", with comments " + comments);
	var result = {
		"DownloadResult" : "201-Request has been created",
		"Message" : ""
	}
	var downloadLogStream = fs.createWriteStream('download.log');
	var uploadLogStream = fs.createWriteStream('upload.log');
	var getInfoLogStream = fs.createWriteStream('title-size.txt');
	var remoteDocker = new Docker({
			//protocol: 'https', //you can enforce a protocol
			host : REMOTE_DOCKER_HOST,
			port : process.env.REGISTRY_HOST_PORT || 2376,
			ca : fs.readFileSync('/remote-tls/ca.pem'),
			cert : fs.readFileSync('/remote-tls/cert.pem'),
			key : fs.readFileSync('/remote-tls/key.pem')
		});

	var localDocker = new Docker({
			host : LOCAL_DOCKER_HOST,
			port : process.env.REGISTRY_HOST_PORT || 2376,
			ca : fs.readFileSync('/remote-tls/ca.pem'),
			cert : fs.readFileSync('/remote-tls/cert.pem'),
			key : fs.readFileSync('/remote-tls/key.pem')
		});

	// build command to get title and size of the target video
	var getInfoCmd = './yt-get-title-size.sh ' + targetUrl;
	remoteDocker.run('david/youknownothing-download', ["bash", "-c", getInfoCmd], getInfoLogStream, function (err, data, container) {
		console.log("Get info completed with result: " + JSON.stringify(data));
		if (!data || data.StatusCode != 0) {
			console.error("Failed to get the info of target video: " + targetUrl);
		} else {
			// parse file to get title and size
			var info = parseInfo('title-size.txt');
			var video = {
				"url" : targetUrl,
				"comments" : comments,
				"title" : info.title,
				"size" : info.size
			};
			// insert to DB
			beforeDownload(video, function (data) {
				console.log("insert result: " + JSON.stringify(data))
				var id = data.id;
				// start to download
				// build the command to download the target video via docker run
				var downloadCmd = './yt-download.sh ' + targetUrl + ' "' + comments + '"';
				remoteDocker.run('david/youknownothing-download', ["bash", "-c", downloadCmd], downloadLogStream, {
					"VolumesFrom" : ["shared-data-vol"]
				}, {}, function (err, data, container) {
					console.log("Download completed with result: " + JSON.stringify(data));
					if (data.StatusCode != 0) {
						console.error("Failed to download the target video: " + targetUrl);
						// post to flowdock as fail to download
						getVideoByIdAndPost(id, 'Failed to download with error: ' + JSON.stringify(err), function () {});
					} else {
						// start to upload
						var uploadVideoPath = parsePath('download.log');
						// update the DB
						var video = {
							"id" : id,
							"file_path" : uploadVideoPath,
							"download_status" : true,
							"download_msg" : "Done"
						};
						afterDownload(video, function (path) {
							// post to flowdock as the download is done.
							getVideoByIdAndPost(id, "Download completed.", function () {
								// start to upload via docker
								var uploadCmd = './by-upload.sh "' + path + '"';
								localDocker.run('david/youknownothing-upload',
									["bash", "-c", uploadCmd],
									uploadLogStream, {
									"Env" : [
										"NFS_SERVER=nfs-server",
										"NFS_SRC=/shared-data",
										"NFS_TARGET=/shared-data"
									],
									"HostConfig" : {
										"Privileged" : true,
										"NetworkMode" : "twp",
										"Binds" : ["/root/.bypy/bypy.json:/root/.bypy/bypy.json:ro"]
									}
								}, {}, function (err, data, container) {
									console.log("Upload completed with result: " + JSON.stringify(data));
									if (data.StatusCode != 0) {
										console.error("Failed to upload the target video: " + targetUrl);
										// post to flowdock as fail to upload
										getVideoByIdAndPost(id, 'Failed to upload with error: ' + JSON.stringify(err), function () {});
									} else {
										// update the db
										afterUpload(id, function () {
											console.log("You know one thing now~");
											// post to flowdock as the upload is completed.
											getVideoByIdAndPost(id, 'Upload completed.', function () {});
										})
									}
								}); // docker upload
							}); // getVideoByIdAndPost
						}); // afterDownload
					} // else
				}); // docker download
			}); // beforeDownload
		} // else
	}); // docker get video info
	res.json(result);
});

app.listen(PORT);
console.log("Running on localhost:", PORT);
