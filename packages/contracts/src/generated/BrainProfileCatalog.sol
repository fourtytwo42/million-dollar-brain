// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

library BrainProfileCatalog {
    uint16 internal constant VERSION = 1;
    bytes32 internal constant CATALOG_HASH =
        0x53528e03482ed69833c8f3c99c171fb4367f7727f167dbe797eb1058196b401f;
    uint8 internal constant ACCENT_COUNT = 8;
    uint8 internal constant BADGE_COUNT = 12;
    uint8 internal constant VOICE_COUNT = 5;
    uint8 internal constant VICTORY_LINE_COUNT = 5;
    uint8 internal constant PANIC_LINE_COUNT = 3;
    uint8 internal constant REACTION_COUNT = 8;
    uint16 internal constant TAGLINE_MAXIMUM_BYTES = 96;
}
