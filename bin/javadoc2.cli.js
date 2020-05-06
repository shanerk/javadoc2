#! /usr/bin/env node

const args = require("yargs")
	.version("2.1.0")
	.option("accessors", {
		type: "array",
		alias: "a",
		default: ["global"],
		describe: "List of accessors to parse (global, public, etc)",
		help: "help"
	})
	.option("include", {
		type: "array",
		alias: "i",
		default: ["**/*.cls"],
		describe: "Include a new glob pattern (as input).",
		help: "help"
	})
	.option("exclude", {
		type: "array",
		alias: "e",
		default: ["**/node_modules/**/*"],
		describe: "Exclude a new glob pattern (as input).",
		help: "help"
	})
	.option("format", {
		type: "string",
		alias: "f",
		default: "markdown",
		describe: "Format of the output. Options: 'markdown' | 'json'.",
		help: "help"
	})
	.option("output", {
		type: "string",
		alias: "o",
		demmandOption: true,
		describe: "File to output the generated contents.",
		help: "help"
	})
	.option("debug", {
		type: "string",
		alias: "d",
		default: "false",
		describe: "If true, debug messages are shown.",
		help: "help"
	})
	.argv;

require(__dirname + "/../src/javadoc2.js").generate(args);
