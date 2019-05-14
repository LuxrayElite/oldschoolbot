const { Command } = require('klasa');
const fetch = require('node-fetch');

module.exports = class extends Command {

	constructor(...args) {
		super(...args, {
			cooldown: 2,
			description: 'Shows the Time to 200m all of an account',
			usage: '[user:user|username:str]',
			requiredPermissions: ['EMBED_LINKS']
		});
	}

	async run(msg, [username]) {
		username = this.getUsername(username, msg);

		const time = await fetch(`http://crystalmathlabs.com/tracker/api.php?type=virtualhiscores&page=timeto200mall&players=${username}`)
			.then(res => res.text())
			.then(async res => await this.cmlErrorCheck(msg, res) || parseInt(res.split(',')[1].split('.')[0]).toLocaleString());

		return msg.sendLocale('TTM_RESULT', [username, time]);
	}

};
