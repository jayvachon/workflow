'use strict';

var async = require('async');
var _ = require('lodash');
var config = require('../config');
var request = require('request');
var logger 	= require('./logger');

let spaceId = 'ahwLqAycOr4jZ9eJe5cbCb';
let urlRoot = 'https://api.assembla.com/v1/spaces/' + spaceId + '/';
var assemblaData = {};

var api = {

	get: function(path, cb) {
		request(
			{
				url: urlRoot + path,
				headers: {
					'X-Api-key': config.api_key,
					'X-Api-secret': config.api_secret,
				}
			},
			function(err, res, body) {
				if (err) {
					return logger.error(err);
				}
				if (cb) {
					cb(JSON.parse(body));
				} else {
					logger.log(body);
				}
			});
	},

	post: function(path, form, cb) {

		// https://www.google.com/search?q=node+simple-git&oq=node+simple-git&aqs=chrome.0.69i59l2.3744j0j4&sourceid=chrome&ie=UTF-8

		var formData = querystring.stringify(form);
		var contentLength = formData.length;

		request({
			url: urlRoot + path,
			headers: {
				'Content-Length': contentLength,
				'Content-Type': 'application/x-www-form-urlencoded',
				'X-Api-key': config.api_key,
				'X-Api-secret': config.api_secret,
			},
			body: formData,
			method: 'POST'
		}, function(err, res, body) {
			if (err) {
				return logger.error(err);
			}
			if (cb) {
				cb(JSON.parse(body));
			} else {
				logger.log(body);
			}
		});
	},

	fetchTickets: function(cb) {
		this.get('tickets?report=0', function(body) {
			// tickets = JSON.parse(body);
			// logger.log(tickets);
			// logger.log(tickets.length);
			cb(body);
		});
	},

	init: function(cb) {

		var self = this;

		async.parallel([
			function(cb) {
				self.get('users', function(body) {
					assemblaData.users = body;
					cb(null);
				});
			},
			function(cb) {
				self.get('space_tools', function(body) {
					
					// Filter the spaces so that we only get the spaces associated with repositories
					assemblaData.space_tools = _.filter(body, function(n) {

						if (!n.url)
							return false;

						var hasRepo = false;
						for (var i = 0; i < config.settings.repos.length; i++) {
							if (n.url.indexOf(config.settings.repos[i].repo) !== -1) {
								hasRepo = true;
								break;
							}
						}
						return hasRepo;
					});
					cb(null);
				});
			},
			function(cb) {
				self.fetchTickets(function(body) {
					assemblaData.tickets = body;
					cb(null);
				});
			}
		], function(err, results) {
			if (err) {
				return logger.log(err);
			}
			cb(assemblaData);
		});
	},

	makeMergeRequest: function(mergeData) {

		var data = {
			merge_request: {
				// title:
				// source_symbol:
				// target_symbol:
			}
		};

		//this.post('')
	},
};

module.exports = api;