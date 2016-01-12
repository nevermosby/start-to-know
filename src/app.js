var express = require('express');
var path = require('path');
var bodyParser = require('body-parser');
var fs = require('fs');
var request = require('request');
var Docker = require('dockerode');


var PORT = 4000;
var app = express();
app.use(bodyParser.json());

app.get('/', function (req, res) {
	res.send('Start to know Service');
});

app.post('/twp/download', function (req, res) {
	var targetUrl = req.body.targetUrl;
	var comments = req.body.comments;
	console.log("Get request to download " + targetUrl + ", with comments " + comments);
	var result = {"DownloadResult":"201-Request has been created","Message":""}
	var downloadLogStream = fs.createWriteStream('download.log');
	var uploadLogStream = fs.createWriteStream('upload.log');
	var remoteDocker = new Docker({
		//protocol: 'https', //you can enforce a protocol
		host: "38.123.98.26",
		port: process.env.REGISTRY_HOST_PORT || 2376,
		ca: fs.readFileSync('/remote-tls/ca.pem'),
		cert: fs.readFileSync('/remote-tls/cert.pem'),
		key: fs.readFileSync('/remote-tls/key.pem')
	});

	var localDocker = new Docker({
		host: "101.251.248.198",
		port: process.env.REGISTRY_HOST_PORT || 2376,
		ca: fs.readFileSync('/remote-tls/ca.pem'),
		cert: fs.readFileSync('/remote-tls/cert.pem'),
		key: fs.readFileSync('/remote-tls/key.pem')
	})
	
	// build the command to download the target video via docker run
	var downloadCmd = './yt-download.sh ' + targetUrl + ' "' + comments + '"';
	remoteDocker.run('david/youknownothing-download', ['bash', '-c', downloadCmd], downloadLogStream, {"VolumesFrom":["shared-data-vol"]}, {}, function (err, data, container) {
  		console.log("Download completed with result: " + JSON.stringify(data));
		if (data.StatusCode != 0) {
			console.error("Failed to download the target video: " + targetUrl);
			// TODO: save the error into DB
		}
		else {
			// start to upload
			var uploadVideoPath = "/shared-data/video/Golang UK Conference-Golang UK Conference 2015 - Andrew Gerrand - Stupid Gopher Tricks-UECh7X07m6E.mp4";
			var uploadCmd = './by-upload.sh "' + uploadVideoPath + '"';
			localDocker.run('david/youknownothing-upload', 
					['bash', '-c', uploadCmd], 
					uploadLogStream, 
					{
						"Env": [
							"NFS_SERVER=nfs-server",
							"NFS_SRC=/shared-data",
							"NFS_TARGET=/shared-data"
						],
						"HostConfig": {
							"Privileged": true,
							"NetworkMode": "twp",
							"Binds": ["/root/.bypy/bypy.json:/root/.bypy/bypy.json:ro"]
						}
					}, {}, function (err, data, container) {
						console.log("Upload completed with result: " + JSON.stringify(data));
					});
/*			localDocker.listContainers({ all: false}, function (err, containers){
				if (err) {
					errorMsg = 'error to list containers: ' + err;
					console.error(errorMsg);
					result.Message = errorMsg;
					console.log(JSON.stringify(result));
					
				} else {
					console.log('Container length:' + containers.length);
				}
			});
*/
		}
		
		//res.json(result)
	});

	res.json(result);
/*
	remoteDocker.createContainer({Image: 'ubuntu:trusty', Cmd: ['uname','-r'], name: 'ubuntu-test'}, function (err, container) {
		container.start(function (err, data){
		
		});
	});

	remoteDocker.listContainers({ all: false }, function (err, containers) {
		if (err) {
			errorMsg = 'error to list containers: ' + err;
			console.error(errorMsg);
			result.Message = errorMsg;
			res.json(result);
		} else {
			console.log('Container length:' + containers.length);
			res.json(result)
		}
	});
*/
});

app.listen(PORT);
console.log("Running on localhost:", PORT);


