import { randInt } from 'e';
import { CommandStore, KlasaMessage } from 'klasa';
import { Bank, Misc, Openables } from 'oldschooljs';
import Items from 'oldschooljs/dist/structures/Items';
import Openable from 'oldschooljs/dist/structures/Openable';

import { COINS_ID, Events, MIMIC_MONSTER_ID } from '../../lib/constants';
import { cluesRaresCL } from '../../lib/data/CollectionsExport';
import botOpenables from '../../lib/data/openables';
import { emojiMap } from '../../lib/itemEmojiMap';
import ClueTiers from '../../lib/minions/data/clueTiers';
import { ClueTier } from '../../lib/minions/types';
import { ClientSettings } from '../../lib/settings/types/ClientSettings';
import { UserSettings } from '../../lib/settings/types/UserSettings';
import { BotCommand } from '../../lib/structures/BotCommand';
import { itemNameFromID, roll, stringMatches, updateGPTrackSetting } from '../../lib/util';
import { formatOrdinal } from '../../lib/util/formatOrdinal';

import itemID from '../../lib/util/itemID';

const itemsToNotifyOf = cluesRaresCL
	.concat(ClueTiers.filter(i => Boolean(i.milestoneReward)).map(i => i.milestoneReward!.itemReward))
	.concat([itemID('Bloodhound')]);

const allOpenablesNames = [
	...Openables.map(i => i.name),
	...ClueTiers.map(i => i.name),
	...botOpenables.map(i => i.name)
];

export const allOpenables = [
	...Openables.map(i => i.id),
	...ClueTiers.map(i => i.id),
	...botOpenables.map(i => i.itemID)
];

export default class extends BotCommand {
	public constructor(store: CommandStore, file: string[], directory: string) {
		super(store, file, directory, {
			cooldown: 1,
			aliases: ['clue'],
			usage: '[quantity:int{1,1000000}] [name:...string]',
			usageDelim: ' ',
			oneAtTime: true,
			categoryFlags: ['minion'],
			description: 'Opens openable items, like clue caskets, mystery boxes and crystal keys.',
			examples: ['+open easy', '+open crystal key']
		});
	}

	async showAvailable(msg: KlasaMessage) {
		const available = msg.author.bank().filter(i => allOpenables.includes(i.id));

		if (available.length === 0) {
			return 'You have no openable items.';
		}

		let results = [];
		for (const [item, qty] of available.items()) {
			let emoji = emojiMap.get(item.id) ?? '';
			results.push(`${emoji}${qty}x ${item.name}`);
		}

		return `You have ${results.join(', ')}.`;
	}

	async run(msg: KlasaMessage, [quantity, name]: [number, string | undefined]) {
		if (!name && msg.flagArgs.any === undefined) {
			return msg.channel.send(await this.showAvailable(msg));
		}
		await msg.author.settings.sync(true);
		if (!quantity) {
			quantity = 1;
		}

		if (msg.flagArgs.master && msg.author.bank().has(19_835)) {
			return msg.channel.send('You already have a master clue!');
		}

		if (msg.flagArgs.any !== undefined) {
			return this.any(msg);
		}

		const clue = ClueTiers.find(_tier => _tier.name.toLowerCase() === name!.toLowerCase());
		if (clue) {
			return this.clueOpen(msg, quantity, clue);
		}

		const osjsOpenable = Openables.find(openable => openable.aliases.some(alias => stringMatches(alias, name!)));
		if (osjsOpenable) {
			return this.osjsOpenablesOpen(msg, quantity, osjsOpenable);
		}

		return this.botOpenablesOpen(msg, quantity, name!);
	}

	async any(msg: KlasaMessage) {
		const userBank = msg.author.bank();
		for (const item of allOpenablesNames) {
			const clue = ClueTiers.find(_tier => _tier.name.toLowerCase() === item.toLowerCase());
			if (clue && userBank.has(clue.id)) {
				return this.clueOpen(msg, userBank.amount(clue.id), clue);
			}
			const osjsOpenable = Openables.find(openable => openable.aliases.some(alias => stringMatches(alias, item)));
			if (osjsOpenable && userBank.has(osjsOpenable.id)) {
				return this.osjsOpenablesOpen(msg, userBank.amount(osjsOpenable.id), osjsOpenable);
			}
			const itemID = Items.get(item)?.id;
			if (itemID && userBank.has(itemID)) {
				const itemName = itemNameFromID(itemID);

				if (itemName === undefined) {
					return msg.channel.send(`${itemID} has no name`);
				}
				return this.botOpenablesOpen(msg, userBank.amount(itemID), itemName);
			}
		}
		return msg.channel.send('You have no openable items.');
	}

	async clueOpen(msg: KlasaMessage, quantity: number, clueTier: ClueTier) {
		const clueCount = msg.author.bank().amount(clueTier.id);
		if ((msg.flagArgs.master || msg.flagArgs.all) && clueCount > 0) quantity = clueCount;

		if (clueCount < quantity) {
			return msg.channel.send(
				`You don't have enough ${clueTier.name} Caskets to open!\n\nHowever... ${await this.showAvailable(msg)}`
			);
		}
		const loot = new Bank();
		let actualQuantity = quantity;
		if (msg.flagArgs.master !== undefined) {
			for (let i = 0; i < quantity; i++) {
				loot.add(clueTier.table.open());

				// Master scroll ID
				if (loot.has(19_835)) {
					actualQuantity = i + 1;
					break;
				}
			}
		} else {
			loot.add(clueTier.table.open(quantity));
		}

		let mimicNumber = 0;
		if (clueTier.mimicChance) {
			for (let i = 0; i < actualQuantity; i++) {
				if (roll(clueTier.mimicChance)) {
					loot.add(Misc.Mimic.open(clueTier.name as 'master' | 'elite'));
					mimicNumber++;
				}
			}
		}
		const cost = new Bank().add(clueTier.id, actualQuantity);
		await msg.author.removeItemsFromBank(cost);

		const opened = `You opened ${actualQuantity} ${clueTier.name} Clue Casket${
			actualQuantity > 1 ? 's' : ''
		} ${mimicNumber > 0 ? `with ${mimicNumber} mimic${mimicNumber > 1 ? 's' : ''}` : ''}`;

		if (Object.keys(loot.bank).length === 0) {
			return msg.channel.send(`${openedString} and got nothing :(`);
		}

		const nthCasket = (msg.author.settings.get(UserSettings.ClueScores)[clueTier.id] ?? 0) + actualQuantity;

		// If this tier has a milestone reward, and their new score meets the req, and
		// they don't own it already, add it to the loot.
		if (
			clueTier.milestoneReward &&
			nthCasket >= clueTier.milestoneReward.scoreNeeded &&
			(await msg.author.numOfItemsOwned(clueTier.milestoneReward.itemReward)) === 0
		) {
			loot.add(clueTier.milestoneReward.itemReward);
		}

		const announcedLoot = loot.filter(i => itemsToNotifyOf.includes(i.id), false);
		if (announcedLoot.length > 0) {
			this.client.emit(
				Events.ServerNotification,
				`**${msg.author.username}'s** minion, ${msg.author.minionName}, just opened their ${formatOrdinal(
					nthCasket
				)} ${clueTier.name} casket and received **${announcedLoot}**!`
			);
		}

		this.client.emit(
			Events.Log,
			`${msg.author.username}[${msg.author.id}] opened ${actualQuantity} ${clueTier.name} caskets.`
		);

		const previousCL = msg.author.cl();
		await msg.author.addItemsToBank(loot, true);
		if (loot.has(COINS_ID)) {
			updateGPTrackSetting(this.client, ClientSettings.EconomyStats.GPSourceOpen, loot.amount(COINS_ID));
		}

		await msg.author.incrementClueScore(clueTier.id, quantity);

		await msg.author.incrementOpenableScore(clueTier.id, quantity);
		if (mimicNumber > 0) {
		}

		return msg.channel.sendBankImage({
			await msg.author.incrementMonsterScore(MIMIC_MONSTER_ID, mimicNumber);
			bank: loot,
			title: opened,
			content: `You have completed ${nthCasket} ${clueTier.name.toLowerCase()} Treasure Trails.`,
			flags: { showNewCL: 1, ...msg.flagArgs },
			cl: previousCL
			user: msg.author,
		});
	}

	async osjsOpenablesOpen(msg: KlasaMessage, quantity: number, osjsOpenable: Openable) {
		const osjsCount = msg.author.bank().amount(osjsOpenable.id);
		if (msg.flagArgs.all && osjsCount > 0) quantity = osjsCount;
		if (osjsCount < quantity) {
			return msg.channel.send(
				`You don't have enough ${osjsOpenable.name} to open!\n\n However... ${await this.showAvailable(msg)}`
			);
		}
		await msg.author.removeItemsFromBank(new Bank().add(osjsOpenable.id, quantity));

		const loot = new Bank(osjsOpenable.open(quantity, {}));
		const score = msg.author.getOpenableScore(osjsOpenable.id) + quantity;
		this.client.emit(
			Events.Log,
			`${msg.author.username}[${msg.author.id}] opened ${quantity} ${osjsOpenable.name}.`
		);

		msg.author.incrementOpenableScore(osjsOpenable.id, quantity);
		const previousCL = msg.author.cl();
		await msg.author.addItemsToBank(loot, true);
		if (loot.has(COINS_ID)) {
			updateGPTrackSetting(this.client, ClientSettings.EconomyStats.GPSourceOpen, loot.amount(COINS_ID));
		}

		return msg.channel.sendBankImage({
			bank: loot,
			content: `You have opened the ${osjsOpenable.name.toLowerCase()} ${score.toLocaleString()} times.`,
			title: `You opened ${quantity} ${osjsOpenable.name}`,
			flags: { showNewCL: 1, ...msg.flagArgs },
			user: msg.author,
			cl: previousCL
		});
	}

	async botOpenablesOpen(msg: KlasaMessage, quantity: number, name: string) {
		const botOpenable = botOpenables.find(thing => thing.aliases.some(alias => stringMatches(alias, name)));

		if (!botOpenable) {
			return msg.channel.send(
				`That's not a valid thing you can open. You can open a clue tier (${ClueTiers.map(
					tier => tier.name
				).join(', ')}), or another non-clue thing (${botOpenables
					.map(thing => thing.name)
					.concat(Openables.map(thing => thing.name))
					.join(', ')})`
			);
		}
		const botOpenCount = msg.author.bank().amount(botOpenable.itemID);
		if (msg.flagArgs.all && botOpenCount > 0) quantity = botOpenCount;
		if (botOpenCount < quantity) {
			return msg.channel.send(
				`You don't have enough ${botOpenable.name} to open!\n\n However... ${await this.showAvailable(msg)}`
			);
		}
		await msg.author.removeItemsFromBank(new Bank().add(botOpenable.itemID, quantity));

		const score = msg.author.getOpenableScore(botOpenable.itemID);
		const loot = await new Bank().add(botOpenable!.table.roll(quantity));

		const nthOpenable = formatOrdinal(score + randInt(1, quantity));

		if (loot.has("Lil' creator")) {
			this.client.emit(
				Events.ServerNotification,
				`<:lil_creator:798221383951319111> **${msg.author.username}'s** minion, ${
					msg.author.minionName
				}, just received a Lil' creator! They've done ${await msg.author.getMinigameScore(
					'soul_wars'
				)} Soul wars games, and this is their ${nthOpenable} Spoils of war crate.`
			);
		}

		if (botOpenable.itemID === itemID('Bag full of gems') && loot.has('Uncut onyx')) {
			this.client.emit(
				Events.ServerNotification,
				`${msg.author} just received an Uncut Onyx from their ${nthOpenable} Bag full of gems!`
			);
		}

		msg.author.incrementOpenableScore(botOpenable.itemID, quantity);
		const previousCL = msg.author.cl();
		await msg.author.addItemsToBank(loot.values(), true, false);
		if (loot.amount('Coins') > 0) {
			updateGPTrackSetting(this.client, ClientSettings.EconomyStats.GPSourceOpen, loot.amount('Coins'));
		}

		return msg.channel.sendBankImage({
			bank: loot,
			content: `You have opened the ${botOpenable.name.toLowerCase()} ${(
				score + quantity
			).toLocaleString()} times.`,
			title: `You opened ${quantity} ${botOpenable.name}`,
			flags: { showNewCL: 1, ...msg.flagArgs },
			user: msg.author,
			cl: previousCL
		});
	}
}