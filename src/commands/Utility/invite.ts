import { KlasaMessage } from 'klasa';

import { BotCommand } from '../../lib/BotCommand';

export default class extends BotCommand {
	async run(msg: KlasaMessage) {
		return msg.send(
			`You can invite the bot to your server using this link: https://discord.com/oauth2/authorize?client_id=729244028989603850&scope=bot
			
**This is *Bot School Old*, separate to the real bot.**`
		);
	}
}
