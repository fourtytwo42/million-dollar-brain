import {
  controlSpec,
  defaultControlBundle,
  type BrainControlBundle,
  type BrainControlDefinition,
  type ControlOption,
} from "./brain-controls.ts";

export const BRAIN_CONTROL_EXPERIENCE_VERSION = 2;

export type BrainExperienceControl = BrainControlDefinition & {
  rawIndex: number;
  optionValues?: readonly number[];
};

export type BrainControlExperienceSpec = {
  id: number;
  character: string;
  summary: string;
  controls: readonly {
    rawIndex: number;
    label: string;
    optionLabels?: readonly string[];
  }[];
  assetTargetLabel?: string;
};

const e = (
  id: number,
  character: string,
  summary: string,
  controls: BrainControlExperienceSpec["controls"],
  assetTargetLabel?: string,
): BrainControlExperienceSpec => ({
  id,
  character,
  summary,
  controls,
  assetTargetLabel,
});

export const BRAIN_CONTROL_EXPERIENCE: readonly BrainControlExperienceSpec[] = [
  e(
    1,
    "The Moon-Bull Department",
    "Sets the department-wide mandate: survive, grow, or attempt something magnificent.",
    [
      { rawIndex: 0, label: "What is the assignment?" },
      {
        rawIndex: 1,
        label: "How much helmet are we wearing?",
        optionLabels: [
          "Full bubble wrap",
          "Responsible adult",
          "Leather jacket",
          "No helmet",
        ],
      },
      { rawIndex: 2, label: "How much pain before HR gets involved?" },
    ],
  ),
  e(
    2,
    "The Suit-Hoodie Chimera",
    "Decides whether the suit, the hoodie, or neither head gets the portfolio.",
    [
      {
        rawIndex: 0,
        label: "Which head gets the keyboard?",
        optionLabels: ["The suit", "Shared custody", "The hoodie"],
      },
      { rawIndex: 1, label: "How much crypto is allowed indoors?" },
      {
        rawIndex: 3,
        label: "Who is banned from the meeting?",
        optionLabels: ["Nobody", "No new equities", "No new crypto"],
      },
    ],
  ),
  e(
    3,
    "The Basket Case",
    "Chooses how many eggs enter the basket and how large any one egg may become.",
    [
      { rawIndex: 0, label: "How many bags are we juggling?" },
      { rawIndex: 1, label: "How big can one bag get?" },
      { rawIndex: 2, label: "How allergic are we to matching charts?" },
    ],
  ),
  e(
    4,
    "Time-Horizon Time Machine",
    "Controls when the machine wakes up and how far into the future it squints.",
    [
      { rawIndex: 0, label: "How often do we press the button?" },
      { rawIndex: 1, label: "Which timeline are we trading?" },
    ],
  ),
  e(
    5,
    "Dry-Powder Goblin",
    "Hoard cash, deploy cash, and decide how dramatic the scoop should be.",
    [
      { rawIndex: 0, label: "How full is the emergency sock?" },
      { rawIndex: 1, label: "What makes the goblin spend?" },
      {
        rawIndex: 2,
        label: "How large is the scoop?",
        optionLabels: [
          "Tiny nibble",
          "Normal scoop",
          "Double scoop",
          "Empty the allowed bucket",
        ],
      },
    ],
  ),
  e(
    6,
    "Caffeinated Hummingbird",
    "Lets panic wake the brain early without bypassing safety checks.",
    [
      { rawIndex: 0, label: "What wakes the bird?" },
      { rawIndex: 1, label: "How fast does it flap?" },
      { rawIndex: 3, label: "Caffeine level" },
    ],
  ),
  e(
    7,
    "Momentum Moth",
    "Chooses which glowing candles the moth follows and when it admits the lamp was fake.",
    [
      { rawIndex: 0, label: "Which candles are hypnotic?" },
      {
        rawIndex: 2,
        label: "Do we chase the light?",
        optionLabels: ["Fly away", "Circle, then follow", "Into the lamp"],
      },
      {
        rawIndex: 3,
        label: "What if the candle lies?",
        optionLabels: [
          "Pretend nothing happened",
          "Back away slowly",
          "Emergency exit",
        ],
      },
    ],
  ),
  e(
    8,
    "Bargain-Bin Prophet",
    "Defines what counts as cheap and how much quality the clearance oracle demands.",
    [
      { rawIndex: 0, label: "Which price tag matters?" },
      { rawIndex: 1, label: "How clearance must it be?" },
      { rawIndex: 3, label: "Value-trap exorcism" },
    ],
  ),
  e(
    9,
    "The Adult in the Room",
    "Sets the minimum evidence required before anyone is allowed to call a company good.",
    [
      { rawIndex: 0, label: "Show me the receipts" },
      { rawIndex: 1, label: "How many receipts count?" },
      { rawIndex: 2, label: "What if the numbers get worse?" },
    ],
  ),
  e(
    10,
    "Volatility Vampire",
    "Chooses how much chaos the vampire drinks and when a drawdown tastes poisonous.",
    [
      { rawIndex: 0, label: "How thirsty are we?" },
      { rawIndex: 2, label: "What does a drawdown taste like?" },
      { rawIndex: 3, label: "Maximum chaos in the cellar" },
    ],
  ),
  e(
    11,
    "Big-Fish Energy",
    "Chooses the size of pond and whether liquidity can overrule the fish.",
    [
      { rawIndex: 0, label: "How big must the fish be?" },
      { rawIndex: 2, label: "Can liquidity beat fish size?" },
    ],
  ),
  e(
    12,
    "Yield Goblin",
    "Chooses whether coupons, total return, or price appreciation fills the coupon book.",
    [
      { rawIndex: 0, label: "What are we harvesting?" },
      { rawIndex: 1, label: "Which coupon is not cursed?" },
      { rawIndex: 3, label: "Yield-trap protocol" },
    ],
  ),
  e(
    13,
    "Mean-Reversion Pigeon",
    "Decides how far price must wander before the pigeon bets it comes home.",
    [
      { rawIndex: 0, label: "How long is the flight?" },
      { rawIndex: 1, label: "How lost before we bet on home?" },
      { rawIndex: 3, label: "What happens at the birdhouse?" },
    ],
  ),
  e(
    14,
    "Green-Candle Salamander",
    "Chooses which breakout catches fire and what happens when the flame goes out.",
    [
      { rawIndex: 0, label: "How old must the flame be?" },
      { rawIndex: 2, label: "How hard do we chase it?" },
      { rawIndex: 3, label: "When the flame dies" },
    ],
  ),
  e(
    15,
    "Main-Character Energy",
    "Decides who is outperforming the cast and how much screen time the leader earns.",
    [
      { rawIndex: 0, label: "Who are we auditioning against?" },
      { rawIndex: 2, label: "How much screen time for the star?" },
      { rawIndex: 3, label: "What if the star flops?" },
    ],
  ),
  e(
    16,
    "Dip-Buying Pelican",
    "Defines a dip, the size of the bite, and whether the falling knife gets swallowed.",
    [
      { rawIndex: 0, label: "What counts as a tasty red candle?" },
      { rawIndex: 2, label: "Pelican bite size" },
      { rawIndex: 3, label: "Falling-knife gag reflex" },
    ],
  ),
  e(
    17,
    "Bag-Management Golem",
    "Tells the golem when a bag has won and what to do with the excess rocks.",
    [
      { rawIndex: 0, label: "When is the bag officially winning?" },
      { rawIndex: 1, label: "What does the golem do with winners?" },
      { rawIndex: 2, label: "May winners get heavier?" },
    ],
  ),
  e(
    18,
    "Correlation Octopus",
    "Controls how many matching tentacles the portfolio may grow.",
    [
      { rawIndex: 1, label: "How many matching tentacles is too many?" },
      { rawIndex: 2, label: "What happens to a chart-clone cluster?" },
      { rawIndex: 3, label: "How badly do we need a weird tentacle?" },
    ],
  ),
  e(
    19,
    "Normie Core",
    "Controls how much sensible broad-market exposure enters the group chat.",
    [
      {
        rawIndex: 0,
        label: "How normie are we today?",
        optionLabels: [
          "Delete the index app",
          "Quietly watching",
          "Responsible allocation",
          "Dad-port overweight",
          "All hail diversification",
        ],
      },
      {
        rawIndex: 2,
        label: "How wide is the beige sweater?",
        optionLabels: [
          "Concentrated normie",
          "Regular normie",
          "Maximum normie",
        ],
      },
      { rawIndex: 4, label: "Orders from the group chat" },
    ],
    "The normie chosen one",
  ),
  e(
    20,
    "Silicon-Valley Brain",
    "Chooses how much venture-brain enters the basket and which founder gets the check.",
    [
      {
        rawIndex: 0,
        label: "How large is the check?",
        optionLabels: [
          "Pass",
          "Coffee meeting",
          "Seed round",
          "Series A energy",
          "Vision-fund cosplay",
        ],
      },
      {
        rawIndex: 2,
        label: "Which founder disease?",
        optionLabels: [
          "Profitable adult",
          "Balanced delusion",
          "Growth at all costs",
        ],
      },
      { rawIndex: 4, label: "Boardroom orders" },
    ],
    "Founder of the week",
  ),
  e(
    21,
    "The Wafer Cult",
    "Chooses the cult's devotion, sacred layer, and anointed semiconductor.",
    [
      {
        rawIndex: 0,
        label: "How devoted are we?",
        optionLabels: [
          "Apostate",
          "Window shopper",
          "Sunday service",
          "Full robes",
          "Sacrifice the cap table",
        ],
      },
      { rawIndex: 2, label: "Which part of the sacred machine?" },
      { rawIndex: 4, label: "Commandment from the fab" },
    ],
    "The anointed chip",
  ),
  e(
    22,
    "Banker Brain",
    "Sets the banker's rate-world mood and names the institution receiving the indoor vest.",
    [
      {
        rawIndex: 0,
        label: "How much banker brain?",
        optionLabels: [
          "Close the branch",
          "Credit committee only",
          "Normal vest hours",
          "Bonus-pool overweight",
          "Too big to ignore",
        ],
      },
      { rawIndex: 2, label: "What are rates doing to the vest?" },
      { rawIndex: 4, label: "Memo from compliance" },
    ],
    "Preferred institution",
  ),
  e(
    23,
    "Lab-Rat Portfolio",
    "Chooses the experiment's catalyst appetite and which specimen gets the next injection.",
    [
      {
        rawIndex: 0,
        label: "How many experiments survive?",
        optionLabels: [
          "Shut the lab",
          "Observe only",
          "Controlled trial",
          "Mad science",
          "Release the rats",
        ],
      },
      { rawIndex: 2, label: "Catalyst dosage" },
      { rawIndex: 4, label: "Lab instructions" },
    ],
    "Specimen under observation",
  ),
  e(
    24,
    "Mall-Rat Economics",
    "Tells the mall rat how bullish to be on consumers and which storefront gets the food-court crown.",
    [
      {
        rawIndex: 0,
        label: "How packed is the mall?",
        optionLabels: [
          "Boarded up",
          "Window shoppers",
          "Normal Saturday",
          "Holiday crowd",
          "Food-court stampede",
        ],
      },
      { rawIndex: 2, label: "What is the rat watching?" },
      { rawIndex: 4, label: "Food-court decree" },
    ],
    "Storefront of destiny",
  ),
  e(
    25,
    "Doomsday Hamster",
    "Sets the bunker level and which defensive staple gets shelf space.",
    [
      {
        rawIndex: 0,
        label: "How sealed is the bunker?",
        optionLabels: [
          "Open the hatch",
          "Weather radio on",
          "Canned-goods mode",
          "Sirens audible",
          "Civilization optional",
        ],
      },
      { rawIndex: 2, label: "When do we hoard?" },
      { rawIndex: 4, label: "Bunker orders" },
    ],
    "Last item on the shelf",
  ),
  e(
    26,
    "Hard-Hat Arc",
    "Chooses the industrial cycle and which machine gets the hard hat.",
    [
      {
        rawIndex: 0,
        label: "How busy is the jobsite?",
        optionLabels: [
          "Tools down",
          "Taking bids",
          "Normal shift",
          "Double shift",
          "Build everything",
        ],
      },
      { rawIndex: 2, label: "Which part of the cycle?" },
      { rawIndex: 4, label: "Foreman's orders" },
    ],
    "Machine of the month",
  ),
  e(
    27,
    "Dinosaur-Juice Baron",
    "Chooses how oily the portfolio becomes and which dinosaur owns the refinery.",
    [
      {
        rawIndex: 0,
        label: "How much dinosaur juice?",
        optionLabels: [
          "Keep it in the ground",
          "Sniff the barrel",
          "Balanced refinery",
          "Drill, maybe",
          "Release the rigs",
        ],
      },
      { rawIndex: 2, label: "Commodity-beta setting" },
      { rawIndex: 4, label: "Baron's decree" },
    ],
    "Chosen dinosaur",
  ),
  e(
    28,
    "Grid Lord",
    "Decides whether the grid is defensive plumbing or the electrical throne of AI.",
    [
      {
        rawIndex: 0,
        label: "How charged is the grid?",
        optionLabels: [
          "Breaker off",
          "Standby",
          "Normal load",
          "Peak demand",
          "Unlimited lightning",
        ],
      },
      { rawIndex: 2, label: "What powers the thesis?" },
      { rawIndex: 4, label: "Grid command" },
    ],
    "Bearer of the current",
  ),
  e(
    29,
    "Attention Hydra",
    "Chooses how much media noise matters and which signal head wins the argument.",
    [
      {
        rawIndex: 0,
        label: "How many screens are screaming?",
        optionLabels: [
          "Airplane mode",
          "One sleepy tab",
          "Normal doomscroll",
          "Seven screens",
          "Infinite discourse",
        ],
      },
      { rawIndex: 2, label: "Which hydra head gets the feed?" },
      { rawIndex: 4, label: "Pinned-post order" },
    ],
    "Main character of the feed",
  ),
  e(
    30,
    "Landlord Hermit Crab",
    "Sets the property shell's ambition and which real-world asset pays rent.",
    [
      {
        rawIndex: 0,
        label: "How much shell can we afford?",
        optionLabels: [
          "Live with parents",
          "Touring units",
          "Signed lease",
          "Accidental landlord",
          "Real-estate empire",
        ],
      },
      { rawIndex: 2, label: "What is the shell for?" },
      { rawIndex: 4, label: "Note under the tenant's door" },
    ],
    "Property of interest",
  ),
  e(
    31,
    "Digital-Rock Golem",
    "Chooses the crypto-rock posture and which digital boulder enters the bag.",
    [
      {
        rawIndex: 0,
        label: "How hard are the digital rocks?",
        optionLabels: [
          "Paper hands",
          "Pebble watch",
          "Normal geology",
          "Diamond sediment",
          "Full mountain",
        ],
      },
      { rawIndex: 2, label: "Which rock leads?" },
      { rawIndex: 4, label: "Golem's command" },
    ],
    "Chosen rock",
  ),
  e(
    32,
    "DeFi Scarecrow",
    "Sets the farm's risk level and which protocol gets planted.",
    [
      {
        rawIndex: 0,
        label: "How cursed is the farm?",
        optionLabels: [
          "Burn the field",
          "Watch the crows",
          "Small plot",
          "Yield season",
          "Unsupervised tractor",
        ],
      },
      { rawIndex: 2, label: "What makes a crop real?" },
      { rawIndex: 4, label: "Scarecrow's field order" },
    ],
    "Crop of the cycle",
  ),
  e(
    33,
    "Shiny-Object Dragon",
    "Chooses how much treasure to hoard and which commodity joins the cave.",
    [
      {
        rawIndex: 0,
        label: "How shiny must the hoard be?",
        optionLabels: [
          "Sell the cave",
          "One trinket",
          "Respectable pile",
          "Dragon-sized",
          "Cannot see the floor",
        ],
      },
      { rawIndex: 2, label: "Which aisle of the treasure room?" },
      { rawIndex: 4, label: "Dragon's claim" },
    ],
    "Shiniest object",
  ),
  e(
    34,
    "Meme-Lord Marionette",
    "Controls the cursed puppet's speculation budget and names the meme allowed on stage.",
    [
      {
        rawIndex: 0,
        label: "How terminally online are we?",
        optionLabels: [
          "Log off",
          "Lurk only",
          "One meme",
          "Timeline poisoned",
          "Give puppet the treasury",
        ],
      },
      { rawIndex: 2, label: "Maximum meme allocation" },
      { rawIndex: 4, label: "Puppet-master order" },
    ],
    "Meme of the moment",
  ),
  e(
    35,
    "Macro Weather Goblin",
    "Chooses which economic weather matters and how the portfolio dresses for a storm.",
    [
      { rawIndex: 0, label: "Which clouds are real?" },
      { rawIndex: 1, label: "How loud is the weather goblin?" },
      { rawIndex: 4, label: "What do we wear in risk-off weather?" },
    ],
  ),
  e(
    36,
    "Headline-Risk Manager",
    "Chooses which scheduled headlines matter and how long the newsroom waits after impact.",
    [
      { rawIndex: 0, label: "Which headlines can ruin lunch?" },
      { rawIndex: 1, label: "Before the headline drops" },
      { rawIndex: 2, label: "How long until we believe the follow-up?" },
    ],
  ),
  e(
    37,
    "Exit-Liquidity Unicorn",
    "Sets the minimum market depth and what happens when the magical exit door shrinks.",
    [
      { rawIndex: 0, label: "How real must the exit door be?" },
      { rawIndex: 1, label: "How much hoofprint is acceptable?" },
      { rawIndex: 3, label: "When the unicorn stops being liquid" },
    ],
  ),
  e(
    38,
    "Gas-Fee Furnace",
    "Controls when trades may fire and how far the basket must drift before feeding the furnace.",
    [
      { rawIndex: 0, label: "How long until the furnace may eat again?" },
      { rawIndex: 1, label: "How crooked before we rebalance?" },
      { rawIndex: 3, label: "How much gas-fee pain is acceptable?" },
    ],
  ),
  e(
    39,
    "Trust-Issues Owl",
    "Sets the evidence bar, conflict response, and number of assets the owl may investigate.",
    [
      { rawIndex: 0, label: "Which receipts does the owl demand?" },
      { rawIndex: 2, label: "What if the receipts fight?" },
      { rawIndex: 4, label: "How many suspects get investigated?" },
    ],
  ),
  e(
    40,
    "Victory-Lap Racehorse",
    "Decides when a winner earns champagne and whether the horse keeps running.",
    [
      { rawIndex: 0, label: "When do we pop champagne?" },
      { rawIndex: 1, label: "What happens on the victory lap?" },
      { rawIndex: 3, label: "Can the horse race again?" },
    ],
  ),
  e(
    41,
    "First-Date Filter",
    "Controls how skeptical the first date is, the starter position, and the breakup rule.",
    [
      { rawIndex: 0, label: "How suspicious is the first date?" },
      { rawIndex: 1, label: "How expensive is the first drink?" },
      { rawIndex: 4, label: "When do we block the number?" },
    ],
  ),
  e(
    42,
    "Data-Diet Chef",
    "Chooses how large the context meal is, which history is served, and how many dossiers reach the table.",
    [
      {
        rawIndex: 8,
        label: "How large is the context meal?",
        optionLabels: [
          "Tasting menu",
          "Proper dinner",
          "All-you-can-eat evidence",
        ],
      },
      { rawIndex: 9, label: "Which leftovers are still edible?" },
      { rawIndex: 11, label: "How many dossiers leave the kitchen?" },
    ],
  ),
];

if (
  BRAIN_CONTROL_EXPERIENCE.length !== 42 ||
  BRAIN_CONTROL_EXPERIENCE.some((piece, index) => piece.id !== index + 1)
) {
  throw new Error("Brain Control Experience v2 must contain IDs 1 through 42");
}

export function experienceSpec(pieceId: number): BrainControlExperienceSpec {
  const spec = BRAIN_CONTROL_EXPERIENCE[pieceId - 1];
  if (!spec || spec.id !== pieceId)
    throw new Error(`Unknown brain control experience ${pieceId}`);
  return spec;
}

export function experienceControls(pieceId: number): BrainExperienceControl[] {
  const raw = controlSpec(pieceId);
  return experienceSpec(pieceId).controls.map((display) => {
    const control = raw.controls[display.rawIndex];
    if (!control)
      throw new Error(
        `Piece ${pieceId} has no raw control ${display.rawIndex}`,
      );
    const allOptionValues =
      control.kind === "choice" && control.options
        ? control.key === "asset_directive"
          ? [0, 2, 5, 7]
          : control.options.length > 4
            ? [
                0,
                Math.floor((control.options.length - 1) / 3),
                Math.floor(((control.options.length - 1) * 2) / 3),
                control.options.length - 1,
              ]
            : control.options.map((_, index) => index)
        : undefined;
    const options: readonly ControlOption[] | undefined = allOptionValues
      ? allOptionValues.map((rawValue) => {
          const current = control.options![rawValue];
          const label = display.optionLabels?.[rawValue] ?? current.label;
          const meaning =
            control.key === "asset_directive"
              ? current.meaning
              : control.key === "sector_status"
                ? [
                    "Ignore this theme.",
                    "Watch it without adding weight.",
                    "Let it compete normally.",
                    "Give it a meaningful preference.",
                    "Give it the strongest preference allowed by safety caps.",
                  ][rawValue]
                : control.key === "desk_lens"
                  ? `Rank eligible assets using the ${label.toLowerCase()} lens.`
                  : `The allocator treats this choice as ${label.toLowerCase()}.`;
          return {
            ...current,
            label,
            meaning,
          };
        })
      : control.options;
    return {
      ...control,
      rawIndex: display.rawIndex,
      label: display.label,
      options,
      optionValues: allOptionValues,
    };
  });
}

/**
 * Experience v2 intentionally hides the old low-level knobs. When an owner
 * next saves, those hidden values return to the canonical safe defaults so
 * only the visible character levers remain discretionary.
 */
export function prepareExperienceBundle(
  pieceId: number,
  current: BrainControlBundle,
): BrainControlBundle {
  const next = defaultControlBundle(pieceId);
  for (const control of experienceControls(pieceId)) {
    const currentValue =
      current.values[control.rawIndex] ?? next.values[control.rawIndex];
    next.values[control.rawIndex] =
      control.kind === "choice" &&
      control.optionValues &&
      !control.optionValues.includes(currentValue)
        ? control.optionValues.reduce((closest, candidate) =>
            Math.abs(candidate - currentValue) <
            Math.abs(closest - currentValue)
              ? candidate
              : closest,
          )
        : currentValue;
  }
  if (controlSpec(pieceId).assetTag) {
    next.assetIds[3] = current.assetIds[3] ?? 0;
    if (!next.assetIds[3]) next.values[4] = 0;
  }
  return next;
}

export function experienceSummary(
  pieceId: number,
  bundle: BrainControlBundle,
): string {
  return experienceControls(pieceId)
    .map((control) => {
      const value = bundle.values[control.rawIndex] ?? 0;
      if (control.kind === "multi") {
        const selected =
          control.options
            ?.filter((_, index) => (value & (1 << index)) !== 0)
            .map((entry) => entry.label) ?? [];
        return `${control.label}: ${selected.join(", ") || "None"}`;
      }
      if (control.kind === "attention") return `${control.label}: ${value}%`;
      const optionIndex = control.optionValues?.indexOf(value) ?? value;
      return `${control.label}: ${control.options?.[optionIndex]?.label ?? value}`;
    })
    .join(" · ");
}

export function braincellDecree(
  pieceId: number,
  bundle: BrainControlBundle,
  assetName?: string | null,
): string {
  const spec = experienceSpec(pieceId);
  const choices = experienceControls(pieceId).map((control) => {
    const value = bundle.values[control.rawIndex] ?? 0;
    if (control.kind === "multi") {
      const selected =
        control.options
          ?.filter((_, index) => (value & (1 << index)) !== 0)
          .map((entry) => entry.label.toLowerCase()) ?? [];
      return selected.join(", ") || "no optional signals";
    }
    if (control.kind === "attention") return `${value}%`;
    const optionIndex = control.optionValues?.indexOf(value) ?? value;
    return (
      control.options?.[optionIndex]?.label ?? String(value)
    ).toLowerCase();
  });
  const target = assetName ? ` ${assetName} is the chosen one.` : "";
  return `${spec.character} declares ${choices.join(" and ")}.${target}`;
}
