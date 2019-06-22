module.exports = {
    generate: function generate(optionsArg) {
        var options = undefined;
        var methodData = undefined;
        var classData = undefined;
        var currentClassIsTest = undefined;

        const REGEX_CLASS_ENTITIES = /(\/\*\*[\s\S]*?\*\/)\s*(\@[\w]+\s*)*\s*([\w]+)\s*([\w\s]*)\s+class\s*([\w\d]+)\s*(?:[{])[ \t]*$/gm;
        const REGEX_CLASS_ENTITIES_NODOC = /^(?:[ \t])*(\@[\w]+\s*)*\s*([\w]+)\s*([\w\s]*)\s+class\s*([\w\d]+)\s*(?:[{])[ \t]*/gm;
        const REGEX_METHOD_ENTITIES = /[ \t]+(\/\*\*[\s\S]*?\*\/)\s*(?:\@[\w]+\s*)*\s*([\w]*)\s*([\w]*)\s+([\w\d\<\>\[\]\,\s]+)\s([\w\d]+)\s*(\([^\)]*\))\s*(?:[{])[ \t]*$/gm;
        const REGEX_BEGINING_AND_ENDING = /^\/\*\*[\t ]*\n|\n[\t ]*\*+\/$/g;
        const REGEX_JAVADOC_LINE_BEGINING = /\n[\t ]*\*[\t ]?/g;
        const REGEX_JAVADOC_LINE_BEGINING_ATTRIBUTE = /^\@[^\n\t\r ]*/g;

        const ENTITY_TYPE = {
            CLASS_ENTITY: 1,
            METHOD_ENTITY: 2
        }

        // Main
        return (function() {
            normalizeOptions();
            var raw = iterateFiles();
            var data = formatData(raw);
            return data;
        })();

        function normalizeOptions() {
            // Normalize arguments:
            options = Object.assign({
                include: ["**/*.cls"],
                exclude: ["**/node_modules/**/*"],
                output: undefined,
                format: "markdown"
            }, optionsArg);
            hasOutput = options.output;
            // Negate all the excluded patterns:
            options.exclude = [].concat(options.exclude).map(function(item) {
                if (item.charAt(0) === ("!")) {
                    return item;
                }
                return "!" + item;
            });
        };

        function matchAll(str, regexp) {
          let ret = [];
          let result;
          while (result = regexp.exec(str)) {
            ret.push(result);
          }
          return ret;
        }

        function extractJavadocData(text) {
            var javadocFileData = [];

            classData = matchAll(text, REGEX_CLASS_ENTITIES);
            // No Javadoc?  No Problem!
            if (classData.length === 0) classData = matchAll(text, REGEX_CLASS_ENTITIES_NODOC);
            __LOG__('Class matches: ' + classData.length);
            if (classData) {
                javadocFileData = parseData(classData, ENTITY_TYPE.CLASS_ENTITY);
            }

            methodData = matchAll(text, REGEX_METHOD_ENTITIES);
            __LOG__('Method matches: ' + methodData.length);
            if (methodData) {
                javadocFileData = javadocFileData.concat(parseData(methodData, ENTITY_TYPE.METHOD_ENTITY));
            }
            __LOG__("javadocFileData: " + JSON.stringify(javadocFileData));
            return javadocFileData;
        };

        function parseData(javadocData, entityType) {
            var javadocFileDataLines = [];
            javadocData.forEach(function(javadocEntity) {
                // if (entityType === ENTITY_TYPE.CLASS_ENTITY) {
                //     if (javadocEntity[0].indexOf('@IsTest') !== -1) {
                //         currentClassIsTest = true;
                //         return;
                //     } else {
                //         currentClassIsTest = false;
                //     }
                // }
                // if (entityType === ENTITY_TYPE.METHOD_ENTITY) {
                //     if (javadocEntity[0].indexOf('@IsTest') !== -1 || currentClassIsTest) {
                //         return;
                //     }
                // }

                var entityHeader = getEntity(javadocEntity, entityType);
                if (entityHeader !== undefined) javadocFileDataLines.push([entityHeader]);

                if (javadocEntity[1] !== undefined) {
                    var javadocCommentClean = "\n" + javadocEntity[1].replace(REGEX_BEGINING_AND_ENDING, "");
                    var javadocLines = javadocCommentClean.split(REGEX_JAVADOC_LINE_BEGINING);
                    var javadocCommentData = [];
                    var attributeMatch = "default";
                    var lastObject = {
                        name: "default",
                        text: ""
                    };
                    javadocLines.forEach(function(javadocLine) {
                        var attrMatch = javadocLine.match(REGEX_JAVADOC_LINE_BEGINING_ATTRIBUTE);
                        var isNewMatch = (!!attrMatch);
                        if (isNewMatch) {
                            attributeMatch = attrMatch[0].replace(/_/g, " ");
                        }
                        if (isNewMatch) {
                            javadocCommentData.push(lastObject);
                            lastObject = {
                                name: attributeMatch,
                                text: javadocLine.replace(REGEX_JAVADOC_LINE_BEGINING_ATTRIBUTE, "")
                                    .replace(/^ /g, "")
                                    .replace(/(\*)( )+(\/)/g, function(match) {
                                        return match.substr(0, 1) + match.substr(1, match.length - 3) + match.substr(match.length - 1);
                                    })
                            };

                        } else {
                            lastObject.text += "\n" + javadocLine
                                .replace(/^ /g, "")
                                .replace(/(\*)( )+(\/)/g, function(match) {
                                    return match.substr(0, 1) + match.substr(1, match.length - 3) + match.substr(match.length - 1);
                                });
                        }
                    });
                    javadocCommentData.push(lastObject);
                    javadocFileDataLines.push(javadocCommentData);
                }
            });
            return javadocFileDataLines;
        }

        function getEntity(javadocEntity, entityType) {
            if (entityType == ENTITY_TYPE.CLASS_ENTITY) return getClass(javadocEntity);
            if (entityType == ENTITY_TYPE.METHOD_ENTITY) return getMethod(javadocEntity);
            return undefined;
        }

        function getMethod(javadocEntity) {
            var methodSig = {
                name: "Method",
                text: javadocEntity[3] + ' ' +
                    javadocEntity[4] + ' ' +
                    javadocEntity[5] +
                    javadocEntity[6]
            };
            return methodSig;
        }

        function getClass(javadocEntity) {
            var classSig = {
                name: "Class",
                text: javadocEntity[5]
            };
            return classSig;
        }

        function __DBG__(msg) {
            /*
            return;
            var otherArgs = Array.prototype.slice.call(arguments);
            otherArgs.shift();
            console.log.apply(console, ["[DEBUGGING] " + msg].concat(otherArgs));
            //*/
        };

        function __LOG__(msg) {
            if (options.output === undefined) {
                return;
            }
            var otherArgs = Array.prototype.slice.call(arguments);
            otherArgs.shift();
            console.log.apply(console, ["[javadoc2] " + msg].concat(otherArgs));
        };

        function formatData(docComments) {
            const fs = require("fs");
            const path = require("path");
            const mkdirp = require('mkdirp');
            var data = undefined;
            if (options.format === "markdown") {
                var tocData = "";
                data = "";
                for (var file in docComments) {
                    var docCommentsFile = docComments[file];
                    for (var a = 0; a < docCommentsFile.length; a++) {
                        var commentData = docCommentsFile[a];
                        var firstParam = true;
                        __LOG__("commentData: " + commentData);
                        if (commentData === null) break;
                        for (var b = 0; b < commentData.length; b++) {
                            (function(commentData) {
                                var name = commentData[b].name === undefined ? "" : commentData[b].name.replace(/^@/g, "");
                                var text = commentData[b].text === undefined ? "" : commentData[b].text.replace(/\n/g, "");
                                if (name.length) {
                                    name = name[0].toUpperCase() + name.substr(1);
                                }
                                if (name === 'Class') {
                                    tocData += (`\n1. [${text} class](#${text.replace(/\s/g, "-")}-class)`);
                                    text = `\n---\n### ${text} class`;
                                } else if (name === 'Method') {
                                    var methodToc = text.split(" ")[2];
                                    tocData += (`\n   * ${methodToc.substr(0,methodToc.indexOf("("))}`);
                                    text = `#### ${text}`;
                                } else if (name === "Param") {
                                    if (firstParam) {
                                        data += '\n|Type|Name|Description|\n|:---|:---|:---|\n';
                                        firstParam = false;
                                    }
                                    var pname = text.substr(0, text.indexOf(" "));
                                    var descrip = text.substr(text.indexOf(" "));
                                    text = `|${name}|${pname}|${descrip}|`;
                                } else if (name === "Return") {
                                    if (firstParam) {
                                        data += '\n|Type|Name|Description|\n|:---|:---|:---|\n';
                                        firstParam = false;
                                    }
                                    text = `|${name}|n/a|${text}|`;
                                }
                                data += `${text}\n`;
                            })(commentData);
                        }
                    }
                    data += "\n";
                }
                data = "# API Reference\n" + tocData + "\n" + data;
            } else {
                data = JSON.stringify(docComments, null, 4);
            }
            if (options.output === undefined) {
                console.log(data);
            } else {
                __LOG__("Writing results to: " + options.output);
                var folder = path.dirname(options.output);
                if (fs.existsSync(folder)) {
                    if (fs.lstatSync(folder).isDirectory()) {
                        fs.writeFileSync(options.output, data, "utf8");
                    } else {
                        throw {
                            name: "DumpingResultsError",
                            message: "Destiny folder is already a file"
                        };
                    }
                } else {
                    mkdirp.sync(folder);
                    fs.writeFileSync(options.output, data, "utf8");
                }
            }
            return data;
        };

        function iterateFiles() {
            const globule = require("globule");
            const fs = require("fs");
            var docComments = {};
            __LOG__("Starting.");
            __LOG__("Options:", options.include);
            __LOG__("Excluded:", options.exclude);
            __LOG__("Output:", options.output);
            __LOG__("Format:", options.format);
            const files = globule.find([].concat(options.include).concat(options.exclude));
            __LOG__("Files found: " + files.length);
            for (var a = 0; a < files.length; a++) {
                var file = files[a];
                var contents = fs.readFileSync(file).toString();
                var javadocMatches = extractJavadocData(contents);
                __LOG__("Matches in file " + file + ": " + javadocMatches.length);
                if (javadocMatches.length !== 0) {
                    docComments[file] = javadocMatches;
                }
            }
            return docComments;
        };
    }
};