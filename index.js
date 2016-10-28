#!/usr/bin/env node

'use strict';

// https://www.sitepoint.com/javascript-command-line-interface-cli-node-js/

var chalk       = require('chalk');
var clear       = require('clear');
var CLI         = require('clui');
var figlet      = require('figlet');
var inquirer    = require('inquirer');
var confirm		= require('inquirer-confirm');
var menu 		= require('inquirer-menu');
var Preferences = require('preferences');
var Spinner     = CLI.Spinner;
var GitHubApi   = require('github');
var _           = require('lodash');
var git         = require('simple-git')();
var touch       = require('touch');
var fs          = require('fs');
var express		= require('express');
var http		= require('http');
var passport	= require('passport');
var AssemblaStrategy = require('passport-assembla').Strategy;
var process		= require('process');
var exec		= require('child_process').exec;
var files		= require('./lib/files');
var config		= require('./config');
var log 		= console.log;

var prefs = new Preferences('workflow');
var repoCursor = setRepoCursorByName('website');
var sprint = '1.0';
var level = 0;

// Replace all occurances of the string 'search' with the string 'replacement'
String.prototype.replaceAll = function(search, replacement) {
    var target = this;
    return target.replace(new RegExp(search, 'g'), replacement);
};

// Return a string containing a String Of Text (With a Value, If there is one)
var displayValue = function(command, currentValue) {
	return currentValue ? command + ' (' + currentValue + ')': command;
}

// Returns the branch name for the given ticket number and description
var branchNameFormula = function(ticketNumber, description) {
	return prefs.initials.initials
		+ '-' 
		+ ticketNumber
		+ '-' 
		+ description.replaceAll(' ', '-').toLowerCase();
}

// Start the program
function init() {

	setSprint();

	// Display the title
	clear();
	log(
	  chalk.yellow(
	    figlet.textSync('workflow', { horizontalLayout: 'full' })
	  )
	);
	log('Repository: ' + repoCursor);
	log('Sprint: ' + sprint);

	if (!prefs.lastUpdated) {
		preferencesMenu(function() {
			mainMenu();
		});
	} else {
		mainMenu();
	}
}

function setRepoCursor(repo) {
	var path = config.settings.root + repo.repo + '\\';
	git.cwd(path);
	log('Working from the ' + repo.name + ' repo');
	return repo.name;
}
function setRepoCursorByIndex(idx) {
	return setRepoCursor(config.settings.repos[idx]);
}
function setRepoCursorByName(name) {
	return setRepoCursor(_.find(config.settings.repos, function(n) { return n.name == name; }));
}

function setSprint(val) {
	if (!val) {
		sprint = prefs.sprint || '1.0';
	} else {
		sprint = val;		
	}
	prefs.sprint = sprint;
}

function createBranch(cb) {
	
	var argv = require('minimist')(process.argv.slice(2));

	var questions = [
		{
			type: 'input',
			name: 'number',
			message: 'Ticket number:',
			default: argv._[0] || null,
			validate: function(val) {
				if (val && val.match(/^\d+$/)) {
					return true;
				} else {
					return 'Please enter an integer value';
				}
			}
		},
		{
			type: 'input',
			name: 'description',
			message: 'Brief description:',
			default: argv._[1] || null,
			validate: function(val) {
				if (val && val.length + config.settings.initials.length + 4 < 50) {
					return true;
				} else {
					return 'Please enter a shorter description. This will be the name of the branch.';
				}
			}
		}/*,
		{
			type: 'input',
			name: 'parent',
			message: 'Branch from:',
			default: 'develop',
			validate: function(val) {
				// TODO: check if branch exists
				return true;
			}
		}*/
	];

	inquirer.prompt(questions).then(function(answers) {

		var data = {
			number: answers.number,
			description: answers.description,
			parent: answers.parent,
		}

		var branchName = branchNameFormula(data.number, data.description);

		confirm('New branch will be called "' + branchName + '". Cool?')
			.then(function confirmed() {
				// Create the new branch
				git
					//.checkout(data.parent)
					.checkout('develop')
					.checkoutLocalBranch(branchName, function(err) {
						if (err) {
							// TODO: handle 'branch already exists error'
							// example: A branch named 'jv-1000-test-it-now' already exists.
							return cb(mainMenu);
						}
					})
					.then(function() {
						log('Working from new branch ' + branchName)
						return cb();
					});	
			}, function cancelled() {
				log('Cancelled');
				return cb(mainMenu);
			});
	});
}

function mergeBranch(cb) {
	var questions = [
		{
			type: 'input',
			name: 'number',
			message: 'Ticket Number (FULL BRANCH NAME):',
			
			// For now, require the full name of the branch
			// TODO: in the future, ticket/branch will have already been accepted by the time the user gets to this menu

			/*validate: function(val) {
				if (val && val.match(/^\d+$/)) {
					return true;
				} else {
					return 'Please enter an integer value';
				}
			}*/
		},
		{
			type: 'input',
			name: 'commitMsg',
			message: 'Commit message:'
			// TODO: validate to make sure a message is entered and length is not greater than the maximum commit message length
		},
		{
			type: 'input',
			name: 'merge',
			message: 'Merge Title:'
		},
		{
			type: 'input',
			name: 'description',
			message: 'Merge Description:'
		},
		{
			type: 'input',
			name: 'location',
			message: 'Location:'
		},
		{
			type: 'input',
			name: 'tests',
			message: 'Tests (Verify that...):'
		},
		{
			type: 'input',
			name: 'reported',
			message: 'Reported By:',
			default: null
		}
	];

	inquirer.prompt(questions).then(function(answers) {

		var data = {
			ticketNumber: answers.number,
			commitMsg: answers.commitMsg,
			mergeTitle: answers.merge,
			mergeDescription: answers.description,
			location: answers.location,
			tests: answers.tests,
			reported: answers.reported,
		}

		var ticketNumber = data.ticketNumber.replace( /(^.+\D)(\d+)(\D.+$)/i,'$2');
		var mergeTitle = sprint + ' ' + data.mergeTitle + ' re #' + ticketNumber;
		var mergeDescription = 'test #' + ticketNumber + '\n' + data.mergeDescription;

		var ticketDescription = 'TD: \n' +
			'L:\n' + data.location + '\n\n' + 
			'T:\n' + data.tests + '\n\n' +
			data.reported != '' ? 'RB:\n' + data.reported : '';

		var status = new Spinner('');
		status.start();

		// Edit the original ticket (TODO: publish this using the Assembla API)
		fs.writeFile('tmp/merge-ticket.txt', ticketDescription, function(err) {

			if (err) {
				log(err);
			}

			// Push the changes
			git
				.checkout('develop', function() {
					log('pulling develop...');
				})
				.pull(function() {
					log('merging develop...');
				})
				.checkout(data.ticketNumber)

				// TODO: only make a commit if there are files to commit
				.add('.')
				.commit(data.commitMsg)
				.mergeFromTo('develop', data.ticketNumber, function() {
					log('pushing to remote...');
				})

				// TODO: check if remote exists before running this
				.push(['-u', 'origin', data.ticketNumber], function () {
					// done. 
					log('successfully pushed');
				})

				//TODO: Cuz if it does exist, just do a regular ol push
				/*.push('origin', data.ticketNumber, function() {
					log('pushed :)');
				})*/

				.then(function() {
					log('Created merge request');

					// Write the merge request details (TODO: Publish this using the Assembla API)
					fs.writeFile('tmp/merge-request.txt', mergeTitle + '\n\n' + mergeDescription, function(err) {
						if (err) {
							log(err);
						}
						status.stop();
						return cb();	
					});
				});
		});
	});
}

function hotfixMergeBranch(cb) {
	// TODO
}

function preferencesMenu(cb) {
	var argv = require('minimist')(process.argv.slice(2));
	inquirer.prompt(
		[
			{
				type: 'list',
				name: 'action',
				message: 'Edit preferences. What would you like to do?',
				choices: [
					{ name: displayValue('Set initials', prefs.initials.initials), value: 'initials'},
					{ name: displayValue('Set repos root directory', prefs.root), value: 'root' },
					{ name: displayValue('Set default repo', prefs.defaultRepo), value: 'repo' },
					{ name: 'Back', value: 'back' }
				],
				default: 0
			}
		]
	).then(function(choice) {

		switch(choice.action) {
			case 'initials': 
				inquirer.prompt({
					type: 'input',
					name: 'initials',
					message: 'Enter your initials: ',
					validate: function(val) {
						if (!val || val.length < 2 || val.length > 3 || /[^a-zA-Z]/.test(val)) {
							return 'Initials must be between 2 and 3 letters and not contain digits';
						} else {
							return true;
						}
					}
				}).then(function(answer) {
					prefs.initials = answer.toLowerCase();
					prefs.lastUpdated = Date.now();
					return cb();
				});
				break;
			case 'root': 
				// TODO: menu to select repos root
				prefs.lastUpdated = Date.now();
				return cb();
			case 'repo': 
				// TODO: menu to select default repo selection
				prefs.lastUpdated = Date.now();
				return cb();
			case 'back': return cb();
		}
	});
}

function mainMenu() {

	inquirer.prompt(
		[
			{
				type: 'list',
				name: 'action',
				message: 'What would you like to do?',
				choices: [
					{ name: 'Set sprint', value: 'sprint' },
					{ name: 'Set repo', value: 'repo' },
					{ name: 'Browse tickets', value: 'tickets' },
					{ name: 'Edit preferences', value: 'preferences' },
					{ name: 'Exit', value: 'exit' },
				]
			}
		]
	).then(function(choice) {
		switch(choice.action) {
			case 'sprint':
				// TODO: pull sprint from Assembla API
				return inquirer.prompt(
					[
						{
							type: 'input',
							name: 'version',
							message: displayValue('Set the sprint:', sprint),
						}
					]
				).then(function(val) {
					setSprint(val.version);
					return mainMenu();
				});
			case 'repo':
				return repoMenu(mainMenu);			
			case 'tickets':
				return ticketsMenu(mainMenu);
			case 'preferences':
				return preferencesMenu(mainMenu);
			case 'exit':
				return;
		}
	});
}

function ticketsMenu(cb) {
	inquirer.prompt(
		[
			{
				type: 'list',
				name: 'action',
				message: 'Tickets: What would you like to do?',
				choices: [
					{ name: 'Create branch', value: 'create' },
					{ name: 'Prepare for merge request', value: 'merge' },
					{ name: 'Prepare for hotfix merge request', value: 'hotfix' },
					{ name: 'Back', value: 'back' }
				]
			}
		]
	).then(function(choice) {
		switch(choice.action) {
			case 'create':
				return createBranch(ticketsMenu);
			case 'merge':
				return mergeBranch(ticketsMenu);
			case 'hotfix':
				// TODO
				//hotfixMergeBranch(ticketsMenu);
				return cb();
			case 'back':
				return cb();
		}
	});
}

function repoMenu(cb) {
	inquirer.prompt(
		[
			{
				type: 'list',
				name: 'name',
				message: 'Choose the repo you want to work from:',
				choices: _.map(config.settings.repos, function(n) { return n.name; }),
				default: config.settings.repos[0].name
			}
		]
	).then(function(choice) {
		setRepoCursorByName(choice.name);
		return cb();
	});
}

init();

// TODO: authenticate to use Assmbla API

// setup passport
/*passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(obj, done) {
  done(null, obj);
});

passport.use(new AssemblaStrategy({
    clientID: config.assembla.id,
    clientSecret: config.assembla.secret,
    callbackURL: config.host + ":" + config.port + "/callback"
  },
  function(accessToken, refreshToken, profile, done) {
    // To keep the example simple, the user's Assembla profile is returned to
	// represent the logged-in user.  In a typical application, you would want
	// to associate the Assembla account with a user record in your database,
	// and return that user instead.
	return done(null, profile);
  }
));

// configure the app
var app = module.exports = express();
app.server = http.createServer(app);
app.disable('x-powered-by');
app.set('port', config.port);
app.use(passport.initialize());
app.use(passport.session());

app.get('/', 
	passport.authenticate('assembla'));
app.get('/callback',
	passport.authenticate('assembla', { failWithError: true }),
	function(req, res) {
		console.log('login successful');
	});

app.server.listen(config.port, function() {
	console.log('app listening...');
});*/