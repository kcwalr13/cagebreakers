import type { Item, ItemId, RelicId, ToolId } from './types';

/**
 * Items come from a pick of three at the start of each chapter, plus a second pick after
 * beating a Keeper. Tools change the puzzle and are used up; relics strengthen one unit each.
 */
export const ITEMS: Record<ItemId, Item> = {
  chisel: { id: 'chisel', family: 'tool', name: 'Chisel', text: "Raises or lowers one unit's number by 1." },
  flip: { id: 'flip', family: 'tool', name: 'Flip', text: "Turns one unit's number to the opposite face of a die: 1 and 6, 2 and 5, 3 and 4." },
  eraser: { id: 'eraser', family: 'tool', name: 'Eraser', text: 'Removes one stone from your page, opening its cell.' },
  inkpot: { id: 'inkpot', family: 'tool', name: 'Inkpot', text: "Switches an unsealed cage between + and ×. Its target changes to match." },
  lens: { id: 'lens', family: 'tool', name: 'Lens', text: 'Shows the number one empty cell holds in the hidden solution.' },
  blade: { id: 'blade', family: 'relic', name: 'Blade', text: 'Its bearer hits 20% harder.' },
  bulwark: { id: 'bulwark', family: 'relic', name: 'Bulwark', text: 'Its bearer has 25% more HP.' },
  quill: { id: 'quill', family: 'relic', name: 'Quill', text: 'Its bearer needs 25% less mana to cast.' },
  hourglass: { id: 'hourglass', family: 'relic', name: 'Hourglass', text: 'Its bearer attacks 20% faster.' },
  thorn: { id: 'thorn', family: 'relic', name: 'Thorn', text: 'Anyone who hits its bearer takes 30% of that damage back.' },
};

export const TOOLS: readonly ToolId[] = ['chisel', 'flip', 'eraser', 'inkpot', 'lens'];
export const RELICS: readonly RelicId[] = ['blade', 'bulwark', 'quill', 'hourglass', 'thorn'];
export const ALL_ITEMS: readonly ItemId[] = [...TOOLS, ...RELICS];

export const isRelic = (id: ItemId): id is RelicId => ITEMS[id].family === 'relic';

/** Relic strengths, read by the simulator. */
export const RELIC = {
  blade: 0.2,
  bulwark: 0.25,
  quill: 0.25,
  hourglass: 0.2,
  thorn: 0.3,
} as const satisfies Record<RelicId, number>;

/** How many items a pick offers. */
export const PICK_SIZE = 3;
