'use strict';

var _ = require('lodash');
var Preferences = require('preferences');
var p = new Preferences('workflow');

var prefs = {

	defaults: {
		initials: 'aa',
		sprint: '1.0',
		repoCursor: 'website',
		spaceTool: 'dn-D2MrQSr44o3acwqjQXA',
		assembla: {
			space_tools: [],
			users: [],
		},
		activeTicket: null,
		myLocalBranches: [],
	},

	markUpdated: function() {
		p.lastUpdated = Date.now();
	},

	init: function() {
		this.initials = this.defaults.initials;
		this.sprint = this.defaults.sprint;
		this.repoCursor = this.defaults.repoCursor;
		this.activeTicket = this.defaults.activeTicket;
		this.myLocalBranches = this.defaults.myLocalBranches;
		this.markUpdated();
	},

	findSpaceTool(repoName) {
		return _.find(p.assembla.space_tools, function(n) { return n.url.indexOf(repoName) !== -1; });
	},

	findBranch(id) {
		return _.find(p.myLocalBranches, function(n) { return n.indexOf(id) !== -1; });
	},

	print: function() {
		console.log(p);
	},
};

Object.defineProperty(prefs, 'initials', {
	get: function() { return p.initials; },
	set: function(val) { 
		p.initials = val;
		this.markUpdated();
	},
});

Object.defineProperty(prefs, 'sprint', {
	get: function() { return p.sprint; },
	set: function(val) { 
		p.sprint = val; 
		this.markUpdated();
	},
});

Object.defineProperty(prefs, 'repoCursor', {
	get: function() { return p.repoCursor; },
	set: function(val) { 
		p.repoCursor = val;
		this.markUpdated(); 
	},
});

Object.defineProperty(prefs, 'assembla', {
	get: function() { return p.assembla; },
	set: function(val) { p.assembla = val; },
});

Object.defineProperty(prefs, 'activeTicket', {
	get: function() { return p.activeTicket; },
	set: function(val) {
		p.activeTicket = val;
		this.markUpdated();
	},
});

Object.defineProperty(prefs, 'myLocalBranches', {
	get: function() { return p.myLocalBranches; },
	set: function(val) {
		p.myLocalBranches = val;
		this.markUpdated();
	},
});

Object.defineProperty(prefs, 'initialized', {
	get: function() { return p.lastUpdated !== undefined; }
});

module.exports = prefs;