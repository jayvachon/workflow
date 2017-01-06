#!/usr/bin/env node

'use strict';

// https://www.sitepoint.com/javascript-command-line-interface-cli-node-js/

// TODO: service to convert windows style paths to unix paths for gitk (file history)

// TODO: flow = select a ticket to work on, then Workflow updates the branch

var chalk       = require('chalk');
var clear       = require('clear');
var CLI         = require('clui');
var figlet      = require('figlet');
var inquirer    = require('inquirer');
var confirm		= require('inquirer-confirm');
var menu 		= require('inquirer-menu');
var Spinner     = CLI.Spinner;
var GitHubApi   = require('github');
var _           = require('lodash');
var git         = require('simple-git')();
var touch       = require('touch');
var fs          = require('fs');
var querystring = require('querystring');
var open		= require('open');
var passport	= require('passport');
var process		= require('process');
var exec		= require('child_process').exec;
var stackTrace	= require('stack-trace');
var files		= require('./lib/files');
var config		= require('./config');
var api 		= require('./services/api');
var prefs 		= require('./services/prefs');
var logger		= require('./services/logger');

let spaceId = 'ahwLqAycOr4jZ9eJe5cbCb';
let urlRoot = 'https://api.assembla.com/v1/spaces/' + spaceId + '/';
let statuses = ['New', 'InProgress', 'Ready', 'Test', 'Invalid', 'Fixed', 'closed'];
let priorities = [
	{
		name: 'Highest',
		value: 1,
	},
	{
		name: 'High',
		value: 2,
	},
	{
		name: 'Normal',
		value: 3,
	},
	{
		name: 'Low',
		value: 4,
	},
	{
		name: 'Lowest',
		value: 5,
	},
];

// Replace all occurances of the string 'search' with the string 'replacement'
String.prototype.replaceAll = function(search, replacement) {
    var target = this;
    return target.replace(new RegExp(search, 'g'), replacement);
};

// Returns the branch name for the given ticket number and description
var branchNameFormula = function(ticketNumber, description) {
	return prefs.initials
		+ '-' 
		+ ticketNumber
		+ '-' 
		+ description.replaceAll(' ', '-').toLowerCase();
};

// Start the program
function init() {

	// Display the title
	clear();
	logger.log(
	  chalk.yellow(
	    figlet.textSync('workflow', { horizontalLayout: 'full' })
	  )
	);

	// Update Assembla data
	logger.log('Loading Assembla data...');
	api.init(function(data) {

		prefs.assembla = data;
		logger.log('Data loaded successfully! Welcome to Workflow :)\n');

		// If this is the first time Workflow has been loaded, bring the user to the preferences menu
		if (!prefs.initialized) {

			logger.info('Heya :) Welcome to Workflow!');
			logger.info('Since this is your first time using Workflow, please update your preferences.');
			prefs.init();

			preferencesMenu(function() {
				mainMenu();
			});
		} else {

			// Set the working directory
			setRepoCursorByName(prefs.repoCursor);

			// TODO: make sure branches are reloaded whenever the working directory/repo cursor is changed
			loadLocalBranches(function() {
				
				// Show sprint
				logger.log(chalk.yellow('Sprint: ') + chalk.white(prefs.sprint));

				// Show repository
				logger.log(chalk.yellow('Repository: ') + chalk.white(prefs.repoCursor));

				// Show active ticket
				if (prefs.activeTicket)
					logger.log(chalk.yellow('Active ticket: ') + chalk.white('#' + prefs.activeTicket.number + ': ' + prefs.activeTicket.summary));

				// Show branch
				git.revparse(['--abbrev-ref', '--quiet', 'HEAD'], function(err, res) {
					
					if (err) {
						return logger.error(err);
					}

					logger.log(chalk.yellow('Branch: ') + chalk.white(res));
					mainMenu();
				});
			});
		}
	});
}

function setRepoCursor(repo) {
	var path = config.settings.root + repo.relativePath + repo.repo + '\\';
	git.cwd(path);
	prefs.repoCursor = repo.name;
}
function setRepoCursorByIndex(idx) {
	setRepoCursor(config.settings.repos[idx]);
}
function setRepoCursorByName(name) {
	setRepoCursor(_.find(config.settings.repos, function(n) { return n.name == name; }));
}
function loadLocalBranches(cb) {
	git.raw(['branch'], function(err, res) {
		
		if (err) {
			return logger.error(err);
		}

		var arr = res.split('\n');
		var branches = _.map(arr, function(n) { return n.replaceAll('remotes/origin/', '').replaceAll('\n', '').replaceAll(' ',''); });
		prefs.myLocalBranches = _.filter(branches, function(n) { return n.startsWith(prefs.initials + '-'); });

		cb();
	});
}

function branchExists(branchName, cb) {
	git
		.revparse(['--verify', '--quiet', branchName], function(err, res) {
			if (err) {
				return logger.error(err);
			}
			return cb(res !== '');
		});
}

function createTicket(cb) {

	logger.warning('This is a work in progress. Currently it *will* post a new ticket to assembla, which you will need to find yourself.');

	var questions = [
		{
			type: 'input',
			name: 'summary',
			message: 'Title:',
			validate: function(val) {
				if (val && val.length > 0 && val.length + prefs.initials.length + 4 < 100) {
					return true;
				} else {
					if (!val || val.length === 0)
						return 'Please enter a title';
					else
						return 'Please enter a shorter title.';
				}
			}
		},
		{
			type: 'input',
			name: 'description',
			message: 'Description',
		},
		{
			type: 'list',
			name: 'status_name',
			message: 'Status',
			choices: statuses,
			default: 'New',
		},
		{
			type: 'list',
			name: 'priority',
			message: 'Priority',
			choices: priorities,
			default: 2,
		},
	];

	inquirer.prompt(questions).then(function(answers) {
		var data = {
			'ticket': {
				'summary': answers.summary,
				'description': answers.description,
				'status_name': answers.status_name,
				'priority': answers.priority,
				// TODO: assigned_to_id http://api-doc.assembla.com/content/ref/tickets_create.html
			}
		};
		confirm('Everything cool?')
			.then(function confirmed() {
				api.post('tickets', data, function(body) {
					logger.log(body);
					// TODO: open the new ticket's web page
					cb();
				});
				// open('https://app.assembla.com/spaces/oaftrac/tickets/new?from=tickets')
				// log(data);
				// cb();
			}, function cancelled() {
				logger.info('Cancelled');
				cb();
			});
	});
}

function mergeBranch(cb) {

	git.status(function(err, res) {
		if (err) {
			return logger.error(err);
		}

		var questions = [

			// Deprecate this
			{
				type: 'input',
				name: 'number',
				message: 'FULL BRANCH NAME (to be deprecated):',
				
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

			// Merge data
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

			// Ticket data
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

		// If there are uncommitted changes, prompt the user for a commit message
		if (res.files.length > 0) {
			questions.splice(1, 0, {
				type: 'input',
				name: 'commitMsg',
				message: 'Commit message:',
			});
		}

		inquirer.prompt(questions).then(function(answers) {
			
			var data = {
				ticketName: answers.number,
				ticketNumber: answers.number,
				commitMsg: answers.commitMsg,
				mergeTitle: answers.merge,				// Merge request title description
				mergeDescription: answers.description,	// Merge request description
				location: answers.location,
				tests: answers.tests,
				reported: answers.reported,
			};

			logger.warning('No merge request is made because this feature is a WIP');
		});
	});

	/*var questions = [
		{
			type: 'input',
			name: 'number',
			message: 'Ticket Number (FULL BRANCH NAME):',
			
			// For now, require the full name of the branch
			// TODO: in the future, ticket/branch will have already been accepted by the time the user gets to this menu

			// validate: function(val) {
			// 	if (val && val.match(/^\d+$/)) {
			// 		return true;
			// 	} else {
			// 		return 'Please enter an integer value';
			// 	}
			// }
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
			ticketName: answers.number,
			ticketNumber: answers.number,
			commitMsg: answers.commitMsg,
			mergeTitle: answers.merge,				// Merge request title description
			mergeDescription: answers.description,	// Merge request description
			location: answers.location,
			tests: answers.tests,
			reported: answers.reported,
		};

		var ticketNumber = data.ticketNumber.replace( /(^.+\D)(\d+)(\D.+$)/i,'$2');
		var mergeTitle = prefs.sprint + ' ' + data.mergeTitle + ' re #' + ticketNumber;
		var mergeDescription = 'test #' + ticketNumber + '\n' + data.mergeDescription;
		var mergeRequestUrl = 'https://app.assembla.com/spaces/oaftrac/git-18/compare/oaftrac.website:' + data.ticketName + '...oaftrac.website:develop';

		var ticketDescription = 'TD: \n\n' + // TODO: insert existing TD from ticket here
			'L:\n' + data.location + '\n\n' + 
			'T:\n' + data.tests + '\n\n' +
			(data.reported === '' ? '' : 'RB:\n' + data.reported);

		var ticketDescriptionUrl = 'https://app.assembla.com/spaces/oaftrac/tickets/' + data.ticketNumber;

		var status = new Spinner('');
		status.start();

		// Edit the original ticket (TODO: publish this using the Assembla API)
		fs.writeFile('tmp/merge-ticket.txt', ticketDescription, function(err) {

			if (err) {
				return logger.error(err);
			}

			// Push the changes
			git
				.checkout('develop', function() {
					logger.log('pulling develop...');
				})
				.pull(function() {
					logger.log('merging develop...');
				})
				.checkout(data.ticketNumber)

				// TODO: only make a commit if there are files to commit
				.add('.')
				.commit(data.commitMsg)
				.mergeFromTo('develop', data.ticketNumber, function() {
					logger.log('pushing to remote...');
				})

				// TODO: check if remote exists before running this
				.push(['-u', 'origin', data.ticketNumber], function () {
					// done. 
					logger.log('successfully pushed');
				})

				//TODO: Cuz if it does exist, just do a regular ol push
				// .push('origin', data.ticketNumber, function() {
				// 	log('pushed :)');
				// })

				.then(function() {
					logger.info('Created merge request');

					// Write the merge request details (TODO: Publish this using the Assembla API)
					fs.writeFile('tmp/merge-request.txt', mergeTitle + '\n\n' + mergeDescription + '\n\n' + ticketDescriptionUrl, function(err) {
						if (err) {
							logger.error(err);
						}
						status.stop();
						open(mergeRequestUrl);
						open(ticketDescriptionUrl);
						return cb();	
					});
				});
		});
	});*/
}

function updateBranch(cb) {

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
			message: 'Commit message:',
		}
	];

	inquirer.prompt(questions).then(function(answers) {
		
		var data = {
			ticketNumber: answers.number, // TODO: actually the branch name for now
			commitMsg: answers.commitMsg,
		}

		var status = new Spinner('');
		status.start();

		// https://app.assembla.com/spaces/oaftrac/git-18/commits/list/jv-5734-add-account-number-to-vr-export

		git
			/*.checkout('develop', function() {
				log('pulling develop...');
			})
			.pull(function() {
				log('merging develop...');
			})
			.checkout(data.ticketNumber)*/

			// TODO: only make a commit if there are files to commit
			.add('.')
			.commit(data.commitMsg)
			/*.mergeFromTo('develop', data.ticketNumber, function() {
				log('pushing to remote...');
			})*/

			// TODO: check if remote exists before running this
			.push(['-u', 'origin', data.ticketNumber], function () {
				// done. 
				logger.info('successfully pushed');
				status.stop();
				open('https://app.assembla.com/spaces/oaftrac/git-18/commits/list/' + data.ticketNumber)
				return cb();
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
					{ name: logger.value('Set initials',prefs.initials), value: 'initials'},
					{ name: logger.value('Set sprint',prefs.sprint), value: 'sprint' },
					{ name: logger.value('Set repo',prefs.repoCursor), value: 'repo' },
					{ name: 'Back', value: 'back' },
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
					},
					default: prefs.initials || prefs.defaults.initials,
				}).then(function(answer) {

					// update the initials
					prefs.initials = answer.initials.toLowerCase();

					// reload local branches based on the user's new initials
					loadLocalBranches(function() {
						logger.info('Initials set to ' + prefs.initials);
						return cb();
					});
				});
				break;
			case 'sprint':
				return inquirer.prompt(
					[
						{
							type: 'input',
							name: 'version',
							message: logger.value('Set the sprint:'),
							default: prefs.sprint || prefs.defaults.sprint,
						}
					]
				).then(function(val) {
					prefs.sprint = val.version;
					logger.info('Sprint set to ' + prefs.sprint);
					return mainMenu();
				});
			case 'repo':
				return repoMenu(mainMenu);
			case 'back': return cb();
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
					{ name: 'Set active ticket', value: 'active' },
					{ name: 'Create ticket', value: 'ticket' },
					{ name: 'Prepare for merge request', value: 'merge' },
					{ name: 'Prepare for hotfix merge request', value: 'hotfix' },
					{ name: 'Update branch', value: 'update' },
					{ name: 'Back', value: 'back' },
				]
			}
		]
	).then(function(choice) {
		switch(choice.action) {
			case 'active':
				return selectActiveTicket(ticketsMenu);
			case 'ticket':
				return createTicket(ticketsMenu);
			case 'merge':
				return mergeBranch(ticketsMenu);
			case 'hotfix':
				// TODO
				//hotfixMergeBranch(ticketsMenu);
				logger.warning('Hotfix not yet implemented');
				return cb();
			case 'update':
				return updateBranch(ticketsMenu);
			case 'back':
				try {
					return cb();
				} catch(e) {
					stackTrace.parse(e);
				}
		}
	});
}

function selectActiveTicket(cb) {

	// Grab the user's active tickets and sort them by priority
	var ticketNames = _.map(prefs.assembla.tickets, function(n) {
		var name = n.status + ': ' + n.number + ' | ' + n.summary;
		var color = 'white';
		switch (n.priority) {
			case 1: color = 'red'; break;		// Highest
			case 2: color = 'yellow'; break;	// High
			case 3: color = 'white'; break;		// Normal
			case 4: color = 'cyan'; break;		// Low
			case 5: color = 'blue'; break;		// Lowest
		}
		return { name: chalk[color](name), value: n.id };
	});

	ticketNames = _.sortBy(ticketNames, function(n) { return n.priority; });

	// List the tickets in a picklist
	var questions = [
		{
			type: 'list',
			name: 'ticket_id',
			message: 'Ticket',
			choices: ticketNames,
		},
	];

	inquirer.prompt(questions).then(function(choice) {

		prefs.activeTicket = _.find(prefs.assembla.tickets, function(n) { return n.id === choice.ticket_id; });
		logger.info('Active ticket set to #' + prefs.activeTicket.number + ' - ' + prefs.activeTicket.summary);

		var branch = prefs.findBranch(prefs.activeTicket.number);
		
		// If there's already a branch associated with the ticket, check it out
		if (branch !== undefined) {
			checkoutBranch(branch, false, cb);
		} else {

			// If not, prompt the user for a name and create the branch
			logger.log('No branch exists yet for this ticket. Please enter a short branch name.');

			var q = [
				{
					type: 'input',
					name: 'branch_name',
					message: 'Branch Name',
					validate: function(val) {
						if (val && val.length + prefs.initials.length + 4 < 50) {
							return true;
						} else {
							return 'Please enter a shorter name.';
						}
					}
				},
			];

			inquirer.prompt(q).then(function(c) {

				var branchName = branchNameFormula(prefs.activeTicket.number, c.branch_name);

				confirm('New branch will be called "' + branchName + '". Cool?')
					.then(function confirmed() {
						checkoutBranch(branchName, true, cb);
					}, function cancelled() {
						logger.info('Cancelled');
						prefs.activeTicket = null;
						cb(mainMenu);
					});
			});
		}
	});
}

function checkoutBranch(branch, isNewBranch, cb) {
	if (isNewBranch) {
		git
			.checkoutLocalBranch(branch, function(err) {
				if (err) {
					return logger.error(err);
				}
			})
			.then(function() {
				logger.info('Working from the ' + branch + ' branch');
				cb();
			});
	} else {
		git
			.checkout(branch, function(err) {
				if (err) {
					return logger.error(err);
				}
			})
			.then(function() {
				logger.info('Working from the ' + branch + ' branch');
				cb();
			});
	}
}

function repoMenu(cb) {
	inquirer.prompt(
		[
			{
				type: 'list',
				name: 'name',
				message: logger.value('Choose the repo you want to work from:', prefs.repoCursor),
				choices: _.map(config.settings.repos, function(n) { return n.name; }),
				default: config.settings.repos[0].name
			}
		]
	).then(function(choice) {
		setRepoCursorByName(choice.name);
		logger.info('Working from the ' + prefs.repoCursor + ' repo');
		return cb();
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
					{ name: 'Manage tickets', value: 'tickets' },
					{ name: 'Edit preferences', value: 'preferences' },
					{ name: 'Exit', value: 'exit' },
				]
			}
		]
	).then(function(choice) {
		switch(choice.action) {
			case 'tickets':
				return ticketsMenu(mainMenu);
			case 'preferences':
				return preferencesMenu(mainMenu);
			case 'exit':
				return;
		}
	});
}

init();