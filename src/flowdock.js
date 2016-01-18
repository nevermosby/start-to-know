'use strict';

var request = require('request');
var config = require('./config')
	module.exports = {

	post2Inbox : function (video, message, callback) {
		if (!video) {
			console.error('Video info is required at flowdockPost');
			return;
		}
		console.log('Got video for flowdock: ' + JSON.stringify(video));
		var post_data = {
			'flow_token' : config.flow_token,
			'tags' : ["@team"],
			'author' : {
				'name' : config.author_name
			},
			'event' : 'activity',
			'title' : 'Video request track',
			'body' : message,
			'thread' : {
				'title' : "Video request summary for  " + video.url,
				'fields' : [{
						'label' : 'Video id',
						'value' : video.id
					}, {
						'label' : 'Video title',
						'value' : video.title
					}, {
						'label' : 'Video url',
						'value' : video.url
					}, {
						'label' : 'Video comments',
						'value' : video.comments
					}, {
						'label' : 'Video size',
						'value' : video.size || ''
					}, {
						'label' : 'Video path',
						'value' : video.path || ''
					}
				]
			},
			'external_thread_id' : video.id
		};

		console.log('post body: ' + JSON.stringify(post_data));
		var post_options = {
			url : config.flowdock_messages,
			method : 'POST',
			json : true,
			body : post_data
		}
		//request.post(config.flowdock_messages, post_data, function (error, response, body) {
		request(post_options, function (error, response, body) {
			if (response.statusCode >= 400) {
				console.log("error to post to flowdock: " + error);
			} else {
				// console.log(response);
				console.log("response body of post to flowdock: " + JSON.stringify(body));
				console.log('Posted to flowdock');
				callback()
			}
		});
	}
};
