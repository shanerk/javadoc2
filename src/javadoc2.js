module.exports = {
    generate: function generate(optionsArg) {
        var options = undefined;
        var methodData;
        var classData;

        // Main
        return (function() {
            normalizeOptions();
            var comments = iterateFiles();
            var data = formatData(comments);
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
            const REGEX_CLASS_SIG = /^\s*([\w]+)\s*([\w\s]*)\s+class\s*([\w\d]+)\s*(?:[{])\s*$/gm;
            const REGEX_METHOD_SIG = /(\/\*\*[\s\S]*?\*\/)\s*(?:\@[\w]+)*\s*([\w]*)\s*([\w]*)\s+([\w\d\<\>\[\]\,\s]+)\s([\w\d]+)\s*(\([^\)]*\))\s*(?:[{])\s*$/gm;
            //const REGEX_JAVADOC = /\/\*\*[^\n]*\n([\t ]*\*[\t ]*[^\n]*\n)+[\t ]*\*\//g;
            const REGEX_BEGINING_AND_ENDING = /^\/\*\*[\t ]*\n|\n[\t ]*\*+\/$/g;
            const REGEX_JAVADOC_LINE_BEGINING = /\n[\t ]*\*[\t ]?/g;
            const REGEX_JAVADOC_LINE_BEGINING_ATTRIBUTE = /^\@[^\n\t\r ]*/g;
            const REGEX_SPACES_EXTREMES = /^[\t\n ]*|[\t\n ]*$/g;
            classData = matchAll(text, REGEX_CLASS_SIG);
            methodData = matchAll(text, REGEX_METHOD_SIG);
            //var javadocComments = text.match(REGEX_JAVADOC);
            var javadocFileData = [];

            if (classData) {
              classData.forEach(function(classSignature) {
                var lastObject = {
                    name: "Class",
                    text: classSignature[1] + ' ' +
                        classSignature[3] + '()'
                };
                javadocFileData.push([lastObject]);
              });
            }

            if (methodData) {
                var i = 0;
                methodData.forEach(function(javadocMethod) {
                    var javadocCommentClean = "\n" + javadocMethod[1].replace(REGEX_BEGINING_AND_ENDING, "");
                    var javadocLines = javadocCommentClean.split(REGEX_JAVADOC_LINE_BEGINING);
                    var javadocCommentData = [];
                    var attributeMatch = "default";
                    var lastObject = {
                        name: "default",
                        text: ""
                    };
                    // __DBG__("JAVADOC", javadocLines);
                    javadocLines.forEach(function(javadocLine) {
                        var attrMatch = javadocLine.match(REGEX_JAVADOC_LINE_BEGINING_ATTRIBUTE);
                        var isNewMatch = (!!attrMatch);
                        if (isNewMatch) {
                            attributeMatch = attrMatch[0].replace(/_/g, " ");
                        }
                        // __DBG__("Javadoc line:", isNewMatch, attributeMatch, javadocLine);
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
                    javadocFileData.push([getMethod(javadocMethod)]);
                    javadocCommentData.push(lastObject);
                    javadocFileData.push(javadocCommentData);
                });
            }
            return javadocFileData;
        };

        function getMethod(javadocMethod) {
            var methodSig = {
                name: "Method",
                text: javadocMethod[2] + ' ' +
                    javadocMethod[3] + ' ' +
                    javadocMethod[4] + ' ' +
                    javadocMethod[5] +
                    javadocMethod[6]
            };
            return methodSig;
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
            // Not needed right now, avoided for branch coverage:
            //if (typeof msg === "string") {
            console.log.apply(console, ["[javadoc] " + msg].concat(otherArgs));
            //}
            //else {
            //		console.log.apply(console, ["[javadoc]", msg].concat(otherArgs));
            //}
            //*/
        };

        function formatData(docComments) {
            const fs = require("fs");
            const path = require("path");
            const mkdirp = require('mkdirp');
            var data = undefined;
            if (options.format === "markdown") {
                data = "";
                for (var file in docComments) {
                    var docCommentsFile = docComments[file];
                    for (var a = 0; a < docCommentsFile.length; a++) {
                        var commentData = docCommentsFile[a];
                        for (var b = 0; b < commentData.length; b++) {
                            (function(commentData) {
                                __DBG__("Comment data:", commentData[b]);
                                var name = commentData[b].name.replace(/^@/g, "");
                                var text = commentData[b].text;
                                if (name.length) {
                                    name = name[0].toUpperCase() + name.substr(1);
                                }
                                __DBG__("Name: " + name);
                                if (name !== "Default") {
                                    data += `**${name}:**`;
                                }
                                if (name === 'Method' || name === 'Class') {
                                    text = `\`${text}\``;
                                }
                                data += ` ${text}\n\n`;
                            })(commentData);
                        }
                        data += "\n\n";
                    }
                }
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