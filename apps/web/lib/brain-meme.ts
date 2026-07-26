export const CHARACTER_ROSTER_VERSION = 4;

export type CharacterKind =
  | "human"
  | "creature"
  | "machine"
  | "object"
  | "supernatural";

export type MemeCharacter = {
  id: number;
  name: string;
  kind: CharacterKind;
  visual: string;
  tagline: string;
  lore: string;
  catchphrases: readonly [string, string, string, string, string];
  rivals: readonly [number, number];
  voice: {
    victory: string;
    objection: string;
    blame: string;
    fallback: string;
  };
  shareHook: string;
};

const character = (
  id: number,
  name: string,
  kind: CharacterKind,
  visual: string,
  catchphrases: MemeCharacter["catchphrases"],
  rivals: MemeCharacter["rivals"],
  voice: MemeCharacter["voice"],
  shareHook: string,
): MemeCharacter => ({
  id,
  name,
  kind,
  visual,
  tagline: shareHook,
  lore: `${voice.victory} ${voice.blame}`,
  catchphrases,
  rivals,
  voice,
  shareHook,
});

export const MEME_CHARACTERS: readonly MemeCharacter[] = [
  character(
    1,
    "The Moon-Bull Department",
    "creature",
    "Three-eyed executive bull",
    [
      "Protect the china.",
      "Hooves near the gas.",
      "Quarterly moo.",
      "Release the bull.",
      "Moon has been approved.",
    ],
    [5, 9],
    {
      victory: "The chart now reports directly to me.",
      objection: "This meeting lacks sufficient upward arrows.",
      blame: "The bear did it. There is always a bear.",
      fallback: "Fine. We graze sideways.",
    },
    "The bull has approved the moon.",
  ),
  character(
    2,
    "The Suit-Hoodie Chimera",
    "creature",
    "Two-headed finance chimera",
    [
      "The tie has custody.",
      "Compliance gets weekdays.",
      "Shared custody.",
      "The hoodie gets weekends.",
      "The hoodie has the seed phrase.",
    ],
    [9, 34],
    {
      victory: "Both heads are claiming sole authorship.",
      objection: "One head objects. The other already aped.",
      blame: "The other head signed it.",
      fallback: "The custody hearing continues.",
    },
    "Two heads, one portfolio, no peace.",
  ),
  character(
    3,
    "The Basket Case",
    "object",
    "Sentient overflowing wicker basket",
    [
      "More eggs, smaller panic.",
      "Add another handle.",
      "A normal number of eggs.",
      "Remove the weak eggs.",
      "One egg. Maximum conviction.",
    ],
    [15, 18],
    {
      victory: "Every egg is exactly where I misplaced it.",
      objection: "This allocation lacks basket integrity.",
      blame: "An egg rolled away during execution.",
      fallback: "The basket remains emotionally diversified.",
    },
    "Diversification has become a personality disorder.",
  ),
  character(
    4,
    "Time-Horizon Time Machine",
    "machine",
    "Anxious clockwork automaton",
    [
      "Five minutes is long term.",
      "See you next candle.",
      "Today is sufficient.",
      "Wake me next quarter.",
      "Civilization will vindicate me.",
    ],
    [6, 40],
    {
      victory: "History will remember this in approximately one hour.",
      objection: "Wrong timeline.",
      blame: "The future arrived incorrectly.",
      fallback: "Temporal committee adjourned.",
    },
    "The time machine changed the chart interval.",
  ),
  character(
    5,
    "Dry-Powder Goblin",
    "creature",
    "Cash-hoarding goblin",
    [
      "Cash is for cowards.",
      "A small emergency crumb.",
      "My snack fund.",
      "Do not touch the sack.",
      "I have become the reserve.",
    ],
    [1, 12],
    {
      victory: "The emergency sack remains deliciously heavy.",
      objection: "Nobody asked the liquidity sack.",
      blame: "They spent my emergency crumbs.",
      fallback: "I will sit on the cash and hiss.",
    },
    "The goblin has secured the snack fund.",
  ),
  character(
    6,
    "Caffeinated Hummingbird",
    "creature",
    "Trembling espresso hummingbird",
    [
      "Do not move for an era.",
      "One slow blink.",
      "Normal mammal speed.",
      "Refresh it again.",
      "I can hear the mempool.",
    ],
    [4, 38],
    {
      victory: "I refreshed before the transaction existed.",
      objection: "This decision took several geological epochs.",
      blame: "Latency personally betrayed me.",
      fallback: "I will refresh the fallback.",
    },
    "The hummingbird can hear the mempool.",
  ),
  character(
    7,
    "Momentum Moth",
    "creature",
    "Moth hypnotized by green candles",
    [
      "The flame is a trap.",
      "Approach cautiously.",
      "The candle is quiet.",
      "Green light pretty.",
      "I must enter the candle.",
    ],
    [13, 14],
    {
      victory: "The candle called and I answered.",
      objection: "That chart is insufficiently luminous.",
      blame: "Someone turned off the green light.",
      fallback: "I orbit the last known candle.",
    },
    "The moth saw green and lost all agency.",
  ),
  character(
    8,
    "Bargain-Bin Prophet",
    "human",
    "Elderly clearance oracle",
    [
      "Only fallen empires.",
      "Check the damaged shelf.",
      "Fair enough.",
      "The future has coupons.",
      "Everything is cheap from tomorrow.",
    ],
    [7, 9],
    {
      victory: "The clearance sticker foretold this.",
      objection: "You paid retail for a prophecy.",
      blame: "The calculator crystal was cracked.",
      fallback: "The bargain remains in the bin.",
    },
    "The prophet found alpha in the clearance aisle.",
  ),
  character(
    9,
    "The Adult in the Room",
    "human",
    "Exhausted fundamentals analyst",
    [
      "Show me the fortress.",
      "Revenue would be nice.",
      "Open the statements.",
      "Fine, one story stock.",
      "Apparently vibes are GAAP now.",
    ],
    [1, 34],
    {
      victory: "I have placed the receipts on the table.",
      objection: "Does this asset have revenue or only lore?",
      blame: "The children took the treasury keys.",
      fallback: "Nobody moved and that is technically governance.",
    },
    "The adult asked whether the company has revenue.",
  ),
  character(
    10,
    "Volatility Vampire",
    "supernatural",
    "Spike-feeding vampire",
    [
      "Beige repels me.",
      "A modest pulse.",
      "Medium rare.",
      "Pour the hot sauce.",
      "I drink the wick.",
    ],
    [5, 39],
    {
      victory: "The drawdown has excellent mouthfeel.",
      objection: "This portfolio has no pulse.",
      blame: "Someone served me decaf volatility.",
      fallback: "I sleep until the next spike.",
    },
    "The vampire ordered the drawdown medium rare.",
  ),
  character(
    11,
    "Big-Fish Energy",
    "creature",
    "Overdressed literal fish",
    [
      "Whales only.",
      "Large pond.",
      "Normal aquarium.",
      "Midcap reef.",
      "Release the small fry.",
    ],
    [15, 19],
    {
      victory: "I have been seated at the whale table.",
      objection: "This pond is embarrassingly shallow.",
      blame: "The minnows formed a committee.",
      fallback: "I remain the largest fish in this JSON.",
    },
    "A fish measured market cap by height.",
  ),
  character(
    12,
    "Yield Goblin",
    "creature",
    "Coupon-counting goblin",
    [
      "Collect every rent.",
      "Coupons, please.",
      "Total return is acceptable.",
      "Maybe growth pays later.",
      "Income is a boomer rumor.",
    ],
    [5, 31],
    {
      victory: "The coupons have been counted twice.",
      objection: "Where is my rent?",
      blame: "Capital appreciation ate the distribution.",
      fallback: "I will compound my resentment.",
    },
    "The yield goblin wants the portfolio to pay rent.",
  ),
  character(
    13,
    "Mean-Reversion Pigeon",
    "creature",
    "Pigeon that always returns",
    [
      "Never touch the knife.",
      "Circle the bench.",
      "Back toward average.",
      "The dip has breadcrumbs.",
      "Everything returns to this bench.",
    ],
    [7, 14],
    {
      victory: "As predicted, I am back on the same bench.",
      objection: "That price is too far from my bench.",
      blame: "Momentum stole my breadcrumbs.",
      fallback: "I wait. The bench is patient.",
    },
    "The pigeon always comes back.",
  ),
  character(
    14,
    "Green-Candle Salamander",
    "creature",
    "Flame-tailed chart chaser",
    [
      "Extinguish it.",
      "Squint at the wick.",
      "Volume or silence.",
      "Green flame good.",
      "The rocket has a tail.",
    ],
    [7, 13],
    {
      victory: "I licked the candle and it was bullish.",
      objection: "That breakout lacks sufficient fire.",
      blame: "The pigeon sat on the wick.",
      fallback: "I warm myself on the previous candle.",
    },
    "The salamander licked the green candle.",
  ),
  character(
    15,
    "Main-Character Energy",
    "human",
    "Glamorous portfolio diva",
    [
      "Find the understudy.",
      "Give the comeback a scene.",
      "Ensemble episode.",
      "Roll my soundtrack.",
      "The portfolio is about me.",
    ],
    [3, 11],
    {
      victory: "Obviously this cycle was my episode.",
      objection: "Why is the camera on another asset?",
      blame: "The ensemble ruined my close-up.",
      fallback: "Even the fallback needs a star.",
    },
    "The main character found the camera again.",
  ),
  character(
    16,
    "Dip-Buying Pelican",
    "creature",
    "Pelican swallowing red candles",
    [
      "Swallow the panic.",
      "One small dip.",
      "Beak closed.",
      "Spit some out.",
      "Emergency ejection.",
    ],
    [10, 40],
    {
      victory: "The dip fits comfortably in my beak.",
      objection: "That red candle is being wasted.",
      blame: "The pouch exceeded risk limits.",
      fallback: "I keep the dip for later.",
    },
    "The pelican swallowed the red candle whole.",
  ),
  character(
    17,
    "Bag-Management Golem",
    "object",
    "Living portfolio bag with arms",
    [
      "Empty the bag.",
      "Trim the straps.",
      "Let it cook inside.",
      "Add another brick.",
      "Crown the bag.",
    ],
    [15, 40],
    {
      victory: "The bag has promoted itself.",
      objection: "This position has failed bag review.",
      blame: "The zipper was a single point of failure.",
      fallback: "The bag remains professionally managed.",
    },
    "The bag conducted its own performance review.",
  ),
  character(
    18,
    "Correlation Octopus",
    "creature",
    "Eight-armed relationship manager",
    [
      "Separate every arm.",
      "Different tentacle groups.",
      "Normal octopus party.",
      "Matching hats.",
      "One hive, eight arms.",
    ],
    [3, 29],
    {
      victory: "All eight arms independently agreed with me.",
      objection: "These assets are sitting together again.",
      blame: "Tentacle seven leaked the group chat.",
      fallback: "I maintain eight neutral positions.",
    },
    "Eight arms joined the same group chat.",
  ),
  character(
    19,
    "Normie Core",
    "human",
    "Sensible index investor",
    [
      "No index for me.",
      "A little whole market.",
      "Normal groceries.",
      "Index curious.",
      "Own the entire parking lot.",
    ],
    [11, 34],
    {
      victory: "The sensible shoes have prevailed.",
      objection: "This is not in the brochure.",
      blame: "The weirdos changed my default settings.",
      fallback: "I rebalance emotionally to neutral.",
    },
    "Normie Core brought sensible shoes to the degen pit.",
  ),
  character(
    20,
    "Silicon-Valley Brain",
    "human",
    "Founder permanently pitching",
    [
      "Delete the app.",
      "Reduce screen time.",
      "Neutral beta.",
      "There is an app for alpha.",
      "Disrupt the allocation.",
    ],
    [26, 42],
    {
      victory: "We have product-market portfolio fit.",
      objection: "This allocation does not scale.",
      blame: "Legacy finance failed the sprint.",
      fallback: "We pivoted to holding.",
    },
    "The founder turned diversification into a software problem.",
  ),
  character(
    21,
    "The Wafer Cult",
    "machine",
    "Semiconductor priest robot",
    [
      "No chips at communion.",
      "Light silicon ritual.",
      "Neutral wafer.",
      "GPU curious.",
      "All hail the rectangle.",
    ],
    [25, 31],
    {
      victory: "The sacred wafer has posted margins.",
      objection: "This portfolio lacks sufficient rectangles.",
      blame: "The node was impure.",
      fallback: "The fab continues its liturgy.",
    },
    "The wafer cult has entered the allocation.",
  ),
  character(
    22,
    "Banker Brain",
    "human",
    "Human banker in an indoor vest",
    [
      "Close the bank.",
      "Underweight the vest.",
      "Neutral margin.",
      "Suits in favor.",
      "Stand near the printer.",
    ],
    [31, 38],
    {
      victory: "Net interest margin sends its regards.",
      objection: "Who approved this without a vest?",
      blame: "The curve inverted my homework.",
      fallback: "I charge a fee for waiting.",
    },
    "The banker wore a vest indoors and called it risk management.",
  ),
  character(
    23,
    "Lab-Rat Portfolio",
    "creature",
    "Biohacking laboratory rat",
    [
      "Placebo only.",
      "Microdose the thesis.",
      "Control group.",
      "Begin the trial.",
      "Optimize the mitochondria.",
    ],
    [9, 39],
    {
      victory: "The experiment has escaped into production.",
      objection: "Where is the control group?",
      blame: "The mitochondria refused governance.",
      fallback: "The rat returns to baseline.",
    },
    "The lab rat shipped the clinical trial to mainnet.",
  ),
  character(
    24,
    "Mall-Rat Economics",
    "creature",
    "Literal food-court rat",
    [
      "The mall is closed.",
      "Window-shopping only.",
      "Neutral food court.",
      "Treat yourself.",
      "Consumer maxxing.",
    ],
    [25, 35],
    {
      victory: "The checkout line confirms my thesis.",
      objection: "Consumer confidence needs more pretzels.",
      blame: "The food court entered recession.",
      fallback: "I remain beneath the escalator.",
    },
    "The mall rat read GDP from the checkout line.",
  ),
  character(
    25,
    "Doomsday Hamster",
    "creature",
    "Bunker hamster hoarding staples",
    [
      "Empty pantry.",
      "One canned bean.",
      "Normal provisions.",
      "Stock the bunker.",
      "Toilet paper standard.",
    ],
    [21, 24],
    {
      victory: "The bunker now contains sufficient snacks.",
      objection: "Nobody has priced the apocalypse.",
      blame: "The guests consumed the defensive assets.",
      fallback: "I rotate the emergency wheel.",
    },
    "The hamster collateralized the pantry.",
  ),
  character(
    26,
    "Hard-Hat Arc",
    "human",
    "Human industrial foreman",
    [
      "Desk jobs only.",
      "One small crane.",
      "Neutral concrete.",
      "Build it.",
      "Weld the GDP.",
    ],
    [20, 28],
    {
      victory: "If it can be welded, it can be allocated.",
      objection: "This thesis has no hard hat.",
      blame: "Software forgot the bridge.",
      fallback: "The crew remains on standby.",
    },
    "The foreman asked whether the thesis can be welded.",
  ),
  character(
    27,
    "Dinosaur-Juice Baron",
    "creature",
    "Wealthy petroleum dinosaur",
    [
      "Extinction mode.",
      "One tasteful barrel.",
      "Neutral refinery.",
      "Barrel curious.",
      "Drink the dinosaur juice.",
    ],
    [28, 35],
    {
      victory: "The barrels have recognized their rightful baron.",
      objection: "This allocation is insufficiently combustible.",
      blame: "The meteor disrupted guidance.",
      fallback: "I idle the long black car.",
    },
    "The dinosaur became vertically integrated.",
  ),
  character(
    28,
    "Grid Lord",
    "supernatural",
    "Crackling electrical elemental",
    [
      "Pull the plug.",
      "Low voltage.",
      "Stable current.",
      "Energize it.",
      "Become the regulated monopoly.",
    ],
    [26, 27],
    {
      victory: "The cash flow is boring and therefore exquisite.",
      objection: "The grid rejects your excitement.",
      blame: "A squirrel entered the substation.",
      fallback: "I collect the meter fee.",
    },
    "The Grid Lord got excited about paperwork.",
  ),
  character(
    29,
    "Attention Hydra",
    "creature",
    "Multi-screen phone-faced hydra",
    [
      "Touch grass.",
      "One quiet feed.",
      "Normal doomscroll.",
      "Monetize the scroll.",
      "All heads online.",
    ],
    [18, 42],
    {
      victory: "Every head is trending simultaneously.",
      objection: "This decision lacks engagement bait.",
      blame: "Head four posted through it.",
      fallback: "I refresh six feeds in silence.",
    },
    "The hydra monetized your screen time.",
  ),
  character(
    30,
    "Landlord Hermit Crab",
    "creature",
    "Crab carrying an apartment building",
    [
      "No property shell.",
      "Rent skeptic.",
      "Neutral lease.",
      "Brick curious.",
      "Raise the shell rent.",
    ],
    [25, 38],
    {
      victory: "Location, location, crustacean.",
      objection: "This allocation has no rentable shell.",
      blame: "The tenant molted unexpectedly.",
      fallback: "The deposit remains nonrefundable.",
    },
    "The hermit crab tokenized its shell.",
  ),
  character(
    31,
    "Digital-Rock Golem",
    "object",
    "Wi-Fi-enabled stone golem",
    [
      "Fiat mountain.",
      "Crypto skeptical pebble.",
      "Neutral rock.",
      "Orange curious.",
      "Scarcity has Wi-Fi.",
    ],
    [12, 22],
    {
      victory: "The rock remains digitally hard.",
      objection: "Your money is insufficiently geological.",
      blame: "The network misplaced my pickaxe.",
      fallback: "I continue being a rock.",
    },
    "The rock discovered Wi-Fi and became monetary.",
  ),
  character(
    32,
    "DeFi Scarecrow",
    "supernatural",
    "Yield-farming scarecrow",
    [
      "TradFi field.",
      "No crop rotation.",
      "Neutral harvest.",
      "Yield curious.",
      "Full DeFi summer.",
    ],
    [12, 39],
    {
      victory: "The harvest has several unaudited layers.",
      objection: "This field lacks composability.",
      blame: "The crows drained the pool.",
      fallback: "I farm deterministic disappointment.",
    },
    "The scarecrow leveraged the crop rotation.",
  ),
  character(
    33,
    "Shiny-Object Dragon",
    "creature",
    "Commodity-hoarding dragon",
    [
      "No rocks.",
      "One tasteful metal.",
      "Neutral treasure.",
      "Shiny curious.",
      "Hoard everything reflective.",
    ],
    [25, 31],
    {
      victory: "The hoard has achieved symbolic value.",
      objection: "This portfolio does not sparkle.",
      blame: "The golem stole my best rock.",
      fallback: "I sleep on the neutral metals.",
    },
    "The dragon marked every commodity as precious.",
  ),
  character(
    34,
    "Meme-Lord Marionette",
    "object",
    "Terminally online cursed puppet",
    [
      "Serious puppet business.",
      "One tasteful meme.",
      "Neutral posting.",
      "Culture trade.",
      "Terminally online strings.",
    ],
    [2, 9],
    {
      victory: "The timeline has priced my strings.",
      objection: "This decision has no posting velocity.",
      blame: "The algorithm pulled my arm.",
      fallback: "I become the reaction image.",
    },
    "The cursed puppet posted through the rebalance.",
  ),
  character(
    35,
    "Macro Weather Goblin",
    "creature",
    "Basis-point weather goblin",
    [
      "No forecast.",
      "Check one cloud.",
      "Balanced radar.",
      "Macro tourist.",
      "Storm of basis points.",
    ],
    [24, 27],
    {
      victory: "Cloudy with a chance of being right later.",
      objection: "Nobody consulted global liquidity weather.",
      blame: "The Fed moved my cloud.",
      fallback: "The forecast remains seasonally adjusted.",
    },
    "The weather goblin blamed global liquidity.",
  ),
  character(
    36,
    "Headline-Risk Manager",
    "human",
    "Veteran human news editor",
    [
      "Leave before print.",
      "Cautious headline.",
      "Hold the front page.",
      "Event tolerant.",
      "Enjoy the corporate action.",
    ],
    [6, 34],
    {
      victory: "I read the footnote and survived.",
      objection: "This headline has an unacceptable exclamation mark.",
      blame: "The goblin buried the correction.",
      fallback: "We hold for the late edition.",
    },
    "The editor found the footnote nobody wanted.",
  ),
  character(
    37,
    "Exit-Liquidity Unicorn",
    "supernatural",
    "Suspiciously reassuring unicorn",
    [
      "Ocean depth only.",
      "Deep pools.",
      "Normal puddle.",
      "Shallow end.",
      "Someone else will buy it.",
    ],
    [5, 38],
    {
      victory: "You can definitely exit after me.",
      objection: "Liquidity is a limiting belief.",
      blame: "The door became temporarily decorative.",
      fallback: "I remain confidently near the exit.",
    },
    "The unicorn promises someone else will buy it.",
  ),
  character(
    38,
    "Gas-Fee Furnace",
    "machine",
    "Furious transaction-eating furnace",
    [
      "Never feed me.",
      "One cheap crumb.",
      "Balanced burn.",
      "Signal first.",
      "Gas is a social construct.",
    ],
    [6, 37],
    {
      victory: "The transaction has been consumed.",
      objection: "This action costs more than my dignity.",
      blame: "The hummingbird refreshed the gas market.",
      fallback: "I burn nothing and resent everyone.",
    },
    "The furnace ate the transaction fee.",
  ),
  character(
    39,
    "Trust-Issues Owl",
    "creature",
    "Paranoid evidence-demanding owl",
    [
      "Receipts now.",
      "Double-check the branch.",
      "Normal suspicion.",
      "Tiny test flight.",
      "Science-fair position.",
    ],
    [10, 23],
    {
      victory: "I have independently verified my own applause.",
      objection: "Source?",
      blame: "The evidence was formatted emotionally.",
      fallback: "I do not trust the fallback either.",
    },
    "The owl requested a citation for the candle.",
  ),
  character(
    40,
    "Victory-Lap Racehorse",
    "creature",
    "Champagne-drinking racehorse",
    [
      "Cash the ticket.",
      "Clip it early.",
      "Balanced finish.",
      "Let it run.",
      "Never leave the winner.",
    ],
    [4, 16],
    {
      victory: "The tiny champagne was already open.",
      objection: "Why stop before my victory lap?",
      blame: "The pelican ate the finish line.",
      fallback: "I trot around the unchanged allocation.",
    },
    "The racehorse opened champagne at plus four percent.",
  ),
  character(
    41,
    "First-Date Filter",
    "human",
    "Human portfolio matchmaker",
    [
      "Full background check.",
      "Three references.",
      "Normal vetting.",
      "Coffee allocation.",
      "Swipe right immediately.",
    ],
    [15, 39],
    {
      victory: "This asset may meet the portfolio parents.",
      objection: "The profile photo is clearly from another cycle.",
      blame: "The owl made the date weird.",
      fallback: "We remain emotionally unallocated.",
    },
    "The matchmaker made the asset meet the parents.",
  ),
  character(
    42,
    "Data-Diet Chef",
    "human",
    "Human chef serving structured data",
    [
      "Charts only.",
      "Technical snack.",
      "Balanced meal.",
      "Fundamentals heavy.",
      "Macro feast.",
    ],
    [20, 29],
    {
      victory: "The context window has been plated.",
      objection: "This dataset tastes like mystery meat.",
      blame: "The hydra contaminated the mise en place.",
      fallback: "I serve the deterministic special.",
    },
    "The chef refused to serve mystery data.",
  ),
] as const;

export function memeCharacter(pieceId: number) {
  const value = MEME_CHARACTERS[pieceId - 1];
  if (!value || value.id !== pieceId) {
    throw new Error(`Unknown meme character ${pieceId}`);
  }
  return value;
}

export type MemeBrainInput = {
  id: number;
  character: string;
  selectedOption: string;
  signedValue: number;
  weightedValue: number;
  weightBps: number;
  active: boolean;
};

export type MemeCastRole = "spokesperson" | "rival" | "scapegoat" | "support";

export type MemeRecap = {
  version: 1;
  headline: string;
  spokespersonPieceId: number;
  rivalPieceId?: number;
  scapegoatPieceId?: number;
  cast: {
    pieceId: number;
    role: MemeCastRole;
    mood: string;
    influenceBps: number;
    line: string;
  }[];
  shortText: string;
  longText: string;
  disclaimer: string;
};

function strength(piece: MemeBrainInput) {
  return Math.abs(piece.weightedValue);
}

export function generateMemeRecap(
  brain: MemeBrainInput[],
  allocation: Record<string, number>,
): MemeRecap {
  const active = brain
    .filter((piece) => piece.active)
    .sort(
      (left, right) =>
        strength(right) - strength(left) ||
        right.weightBps - left.weightBps ||
        left.id - right.id,
    );
  const nonNeutral = active.filter((piece) => piece.signedValue !== 0);
  const spokesperson = nonNeutral[0] ?? active[0] ?? brain[0];
  if (!spokesperson)
    throw new Error("Cannot build a meme recap without brain pieces");
  const profile = memeCharacter(spokesperson.id);
  const rival =
    active.find((piece) => profile.rivals.includes(piece.id)) ??
    nonNeutral.find(
      (piece) =>
        piece.id !== spokesperson.id &&
        Math.sign(piece.signedValue) !== Math.sign(spokesperson.signedValue),
    ) ??
    active.find((piece) => piece.id !== spokesperson.id);
  const scapegoat = active.find(
    (piece) => piece.id !== spokesperson.id && piece.id !== rival?.id,
  );
  const supporters = active
    .filter(
      (piece) =>
        piece.id !== spokesperson.id &&
        piece.id !== rival?.id &&
        piece.id !== scapegoat?.id,
    )
    .slice(0, 4);
  const index = Math.max(0, Math.min(4, spokesperson.signedValue + 2));
  const allocationLeader =
    Object.entries(allocation).sort(
      (left, right) => right[1] - left[1],
    )[0]?.[0] ?? "USDG";
  const headline = `${profile.name} seized the microphone and declared ${allocationLeader} the main character.`;
  const cast: MemeRecap["cast"] = [
    {
      pieceId: spokesperson.id,
      role: "spokesperson",
      mood: spokesperson.selectedOption,
      influenceBps: spokesperson.weightBps,
      line: profile.catchphrases[index],
    },
  ];
  if (rival) {
    cast.push({
      pieceId: rival.id,
      role: "rival",
      mood: rival.selectedOption,
      influenceBps: rival.weightBps,
      line: memeCharacter(rival.id).voice.objection,
    });
  }
  if (scapegoat) {
    cast.push({
      pieceId: scapegoat.id,
      role: "scapegoat",
      mood: scapegoat.selectedOption,
      influenceBps: scapegoat.weightBps,
      line: memeCharacter(scapegoat.id).voice.blame,
    });
  }
  for (const supporter of supporters) {
    cast.push({
      pieceId: supporter.id,
      role: "support",
      mood: supporter.selectedOption,
      influenceBps: supporter.weightBps,
      line:
        supporter.signedValue === 0
          ? memeCharacter(supporter.id).voice.fallback
          : memeCharacter(supporter.id).voice.victory,
    });
  }
  const allocationText = Object.entries(allocation)
    .map(([symbol, weight]) => `${symbol} ${weight / 100}%`)
    .join(" · ");
  const shortText = `${headline} ${allocationText}`;
  const longText = `${headline}\n\n${cast
    .slice(0, 3)
    .map((item) => `${memeCharacter(item.pieceId).name}: “${item.line}”`)
    .join("\n")}\n\n${allocationText}`;
  return {
    version: 1,
    headline,
    spokespersonPieceId: spokesperson.id,
    rivalPieceId: rival?.id,
    scapegoatPieceId: scapegoat?.id,
    cast,
    shortText,
    longText,
    disclaimer:
      "Satirical steering recap for entertainment, not causal attribution or financial advice.",
  };
}
