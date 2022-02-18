import { reduceNumByPercent } from 'e';

//import { MorytaniaDiary, userhasDiaryTier } from '../../lib/diaries';
//import { GearStat, readableStatName } from '../../lib/gear';
import { difficulties } from '../../lib/minions/data/templeTrekking';
//import { GearRequirement } from '../../lib/minions/types';
//import { UserSettings } from '../../lib/settings/types/UserSettings';
import { percentChance, rand, stringMatches } from '../../lib/util';
import {client} from '../../';
//import addSubTaskToActivityTask from '../../lib/util/addSubTaskToActivityTask';
//import { TempleTrekkingActivityTaskOptions } from './../../lib/types/minions';
import { Bank } from 'oldschooljs';
import { ApplicationCommandOptionType, CommandRunOptions } from 'mahoji';
import TrekShopItems, { TrekExperience } from '../../lib/data/buyables/trekBuyables';
import { rewardTokens } from '../../lib/minions/data/templeTrekking';
import { AddXpParams } from '../../lib/minions/types';
import { SkillsEnum } from '../../lib/skilling/types';
import { OSBMahojiCommand } from '../lib/util';
import { handleMahojiConfirmation } from '../mahojiSettings';

let testvalue='Pure'
const items = TrekShopItems.filter(i=> i.name.toLowerCase().includes(testvalue.toLowerCase())
	).map(i => ({name: i.name, value: i.name}));
console.log(items);

export const tithefarmCommand: OSBMahojiCommand = {
	name: 'trek',
	description: 'Send your minion to complete the tithe farm minigame',
	attributes: {
		categoryFlags: ['minion', 'skilling', 'minigame'],
		description: 'Send your minion to complete the tithe farm minigame.',
		examples: ['/tithefarm start', '/tithefarm buy']
	},
	options: [
	{
			type: ApplicationCommandOptionType.Subcommand,
			name: 'start',
			description: "Allows a player to start the temple trekking minigame.",
			options: [
			{
					name: 'type',
					description: 'The item you want to purchase.',
					type: ApplicationCommandOptionType.String,
					required: true,
					autocomplete: async (value: string) => {
						return difficulties.filter(i =>
							!value ? true : i.difficulty.toLowerCase().includes(value.toLowerCase())
						).map(i => ({ name: i.difficulty, value: i.difficulty }));
					}
				}]},
		{
			type: ApplicationCommandOptionType.Subcommand,
			name: 'buy',
			description: "Allows a player to exchange reward tokens.",
			options: [
			{
					name: 'type',
					description: 'The difficulty of token to use.',
					type: ApplicationCommandOptionType.String,
					required: true,
					autocomplete: async (value: string) => {
						return difficulties.filter(i =>
							!value ? true : i.difficulty.toLowerCase().includes(value.toLowerCase())
						).map(i => ({ name: i.difficulty, value: i.difficulty }));
					}
				},
				{
					name: 'name',
					description: 'The reward you want to purchase.',
					type: ApplicationCommandOptionType.String,
					required: true,
					autocomplete: async (value: string) => {
						return TrekShopItems.filter(i=>
						!value ? true : i.name.toLowerCase().includes(value.toLowerCase())
						).map(i => ({name: i.name, value: i.name}));
					}
				},
				{
					name: 'quantity',
					description: 'The quantity you want to purchase.',
					type: ApplicationCommandOptionType.Integer,
					required: false,
					min_value: 1,
					max_value: 1000
				}
			]
		}
	],
	run: async ({
		channelID,
		options,
		interaction,
		userID
	}: CommandRunOptions<{
		start?:{type:string;}
		buy?: {type:string; name: string; quantity?: number };
	}>) => {
		const user = await client.fetchUser(userID.toString());
		await user.settings.sync(true);
		let {type, name, quantity} = options.buy!
		const userBank = user.bank();
		const specifiedItem = TrekShopItems.find(
			item =>
				stringMatches(name, item.name));
		if (!specifiedItem) {
			return `Item not recognized.`;
		}
		if (quantity === undefined) {
			quantity =
				type === 'easy'
					? userBank.amount(rewardTokens.easy)
					: type === 'medium'
					? userBank.amount(rewardTokens.medium)
					: userBank.amount(rewardTokens.hard);
		}
		if (quantity === 0) {
			return "You don't have enough reward tokens for that.";
		}

		let outItems = new Bank();

		let inItems = new Bank();
		let outXP: AddXpParams[] = [
			{
				skillName: SkillsEnum.Agility,
				amount: 0,
				minimal: true
			},
			{
				skillName: SkillsEnum.Thieving,
				amount: 0,
				minimal: true
			},
			{
				skillName: SkillsEnum.Slayer,
				amount: 0,
				minimal: true
			},
			{
				skillName: SkillsEnum.Firemaking,
				amount: 0,
				minimal: true
			},
			{
				skillName: SkillsEnum.Fishing,
				amount: 0,
				minimal: true
			},
			{
				skillName: SkillsEnum.Woodcutting,
				amount: 0,
				minimal: true
			},
			{
				skillName: SkillsEnum.Mining,
				amount: 0,
				minimal: true
			}
		];

		for (let i = 0; i < quantity; i++) {
			let outputTotal = 0;

			switch (type) {
				case 'easy':
					inItems.addItem(rewardTokens.easy, 1);
					outputTotal = rand(specifiedItem.easyRange[0], specifiedItem.easyRange[1]);
					break;
				case 'medium':
					inItems.addItem(rewardTokens.medium, 1);
					outputTotal = rand(specifiedItem.medRange[0], specifiedItem.medRange[1]);
					break;
				case 'hard':
					inItems.addItem(rewardTokens.hard, 1);
					outputTotal = rand(specifiedItem.hardRange[0], specifiedItem.hardRange[1]);
					break;
			}

			if (specifiedItem.name === 'Herbs') {
				outItems.add(
					percentChance(50) ? 'Tarromin' : 'Harralander',
					Math.floor(reduceNumByPercent(outputTotal, 34))
				);
				outItems.add('Toadflax', Math.floor(reduceNumByPercent(outputTotal, 66)));
			} else if (specifiedItem.name === 'Ore') {
				outItems.add('Coal', Math.floor(reduceNumByPercent(outputTotal, 34)));
				outItems.add('Iron ore', Math.floor(reduceNumByPercent(outputTotal, 66)));
			} else if (specifiedItem.name === 'Experience') {
				const randXP = Math.floor(Math.random() * TrekExperience.length) + 1;

				(outXP.find(item => item.skillName === TrekExperience[randXP]) || outXP[0]).amount += outputTotal;
			} else {
				outItems.add(specifiedItem.name, outputTotal);
			}
		}

		if (!userBank.has(inItems.bank)) {
			return "You don't have enough reward tokens for that.";
		}
		await handleMahojiConfirmation(
				channelID.toString(),
				userID,
				interaction,
				`${user}, please confirm that you want to use ${quantity} ${type} reward tokens to buy sets of ${specifiedItem.name}.`
			);
		if (outItems.length > 0) await user.addItemsToBank({ items: outItems, collectionLog: false });
		await user.removeItemsFromBank(inItems);

		let ret = `You redeemed **${inItems}** for `;
		if (outItems.length > 0) {
			ret += `**${outItems}**`;
		} else {
			ret += 'XP. You received: ';
		}

		ret += (await Promise.all(outXP.filter(xp => xp.amount > 0).map(xp => user.addXP(xp)))).join(', ');

		return `${ret}.`;
	}
}