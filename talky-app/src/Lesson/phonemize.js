import { phonemize } from "phonemizer";

const phonemes = await phonemize("The quick brown fox jumps over the lazy dog.");
console.log(phonemes);