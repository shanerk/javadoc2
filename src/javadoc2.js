module.exports = {
    generate: function generate(optionsArg) {
        var options = undefined;
        var methodData = undefined;
        var propertyData = undefined;
        var classData = undefined;
        var currentClassIsTest = undefined;
        var isIgnorePrivate = true;

        const REGEX_JAVADOC = /\/\*\*[^\n]*\n([\t ]*\*[\t ]*[^\n]*\n)+[\t ]*\*\//g;

        const REGEX_CLASS = /\/\*\*[^\n]*\n([\t ]*\*[\t ]*[^\n]*\n)+[\t ]*\*\/\s*(\@[\w]+\s*)*\s*^([\w]+)\s*([\w\s]*)\s+(?:class|enum)+\s*([\w]+)\s*(?:[{])[ \t]*$/gm;
        const REGEX_CLASS_NODOC = /(\@[\w]+\s*)*\s*^([\w]+)\s*([\w\s]*)\s+(?:class|enum)+\s*([\w]+)\s*(?:[{])[ \t]*/gm;
        const REGEX_METHOD = /\/\*\*[^\n]*\n([\t ]*\*[\t ]*[^\n]*\n)+[\t ]*\*\/\s*(?:\@[\w]+\s*)*\s*([\w]+)\s*([\w]*)\s+([\w\<\>\[\]\, \t]*)\s+([\w]+)\s*(\([^\)]*\))\s*(?:[{])/gm;
        const REGEX_METHOD_NODOC = /([ \t])*(?:\@[\w]+\s*)*[ \t]*([\w]+)[ \t]*([\w]*)[ \t]+([\w\<\>\[\]\, ]*)[ \t]+([\w]+)[ \t]*(\([^\)]*\))\s*(?:[{])/gm;
        const REGEX_PROPERTY = /(?:[ \t])+(\@[\w]+[ \t]*)*\s*(global|public)\s*(static|final|const)*\s+([\w\s\[\]<>,]+)\s+([\w]+)\s*((=[\w\s\[\]<>,{}'=()]*)|;)+/gm;
        const REGEX_BEGINING_AND_ENDING = /^\/\*\*[\t ]*\n|\n[\t ]*\*+\/$/g;
        const REGEX_JAVADOC_LINE_BEGINING = /\n[\t ]*\*[\t ]?/g;
        const REGEX_JAVADOC_LINE_BEGINING_ATTRIBUTE = /^\@[^\n\t\r ]*/g;

        const STR_TODO = "TODO: No documentation currently exists for this _ENTITY_.";

        const ENTITY_TYPE = {
            _CLASS: 1,
            _METHOD: 2,
            _CLASSNODOCS: 3,
            _PROPERTY: 4
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

            // Handle Classes
            classData = matchAll(text, REGEX_CLASS);
            __LOG__('Class matches: ' + classData.length);

            if (classData.length !== 0) {
                javadocFileData = parseData(classData, ENTITY_TYPE._CLASS);
            } else {
                // No Javadoc?  No Problem!
                classData = matchAll(text, REGEX_CLASS_NODOC);
                if (classData) {
                    javadocFileData = parseData(classData, ENTITY_TYPE._CLASSNODOCS);
                }
            }

            // Handle Properties
            propertyData = matchAll(text, REGEX_PROPERTY);
            __LOG__('Property matches: ' + propertyData.length);

            if (propertyData) {
                javadocFileData = javadocFileData.concat(parseData(propertyData, ENTITY_TYPE._PROPERTY));
            }

            // Handle Methods
            methodData = merge(
                matchAll(text, REGEX_METHOD),
                matchAll(text, REGEX_METHOD_NODOC),
                5,
                5
            ).sort(MethodComparator);

            methodData = filter(methodData);
            __LOG__('Method matches: ' + methodData.length);
            if (methodData) {
                javadocFileData = javadocFileData.concat(parseData(methodData, ENTITY_TYPE._METHOD));
            }
            return javadocFileData;
        };

        function filter(data) {
            var ret = [];
            data.forEach(function(item) {
                var include = true;
                if (isIgnorePrivate && item[2] === "private") {
                    include = false;
                }
                if (include) ret.push(item);
            });
            return ret;
        }

        function merge(data1, data2, key1, key2) {
            var keys = [];
            data1.forEach(function(item) {
                keys.push(item[key1]);
            });
            data2.forEach(function(item) {
                if (!keys.includes(item[key2])) {
                    data1.push(item);
                }
            });
            return data1;
        }

        function MethodComparator(a, b) {
            if (a[5] < b[5]) return -1;
            if (a[5] > b[5]) return 1;
            return 0;
          }

        function parseData(javadocData, entityType) {
            var javadocFileDataLines = [];
            javadocData.forEach(function(javadocEntity) {
                if (entityType === ENTITY_TYPE._CLASS) {
                    if (javadocEntity[0].indexOf('@IsTest') !== -1) {
                        currentClassIsTest = true;
                        return;
                    } else {
                        currentClassIsTest = false;
                    }
                }
                if (entityType === ENTITY_TYPE._METHOD) {
                    if (javadocEntity[0].indexOf('@IsTest') !== -1 || currentClassIsTest) {
                        return;
                    }
                }

                var entityHeader = getEntity(javadocEntity, entityType);
                if (entityHeader !== undefined) javadocFileDataLines.push([entityHeader]);

                if (javadocEntity[0].match(REGEX_JAVADOC) !== null) {
                    var javadocCommentClean = "\n" + javadocEntity[0].split("*/")[0].replace(REGEX_BEGINING_AND_ENDING, "");
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
                    if (lastObject.text.replace(/\s/g, "") === "") {
                        lastObject.text = STR_TODO.replace("_ENTITY_", "WASSUP?");
                    }
                    javadocCommentData.push(lastObject);
                    javadocFileDataLines.push(javadocCommentData);
                } else if (entityType === ENTITY_TYPE._CLASSNODOCS) {
                    javadocFileDataLines.push([{text: STR_TODO.replace("_ENTITY_", "class")}]);
                } else if (entityType === ENTITY_TYPE._METHOD) {
                    javadocFileDataLines.push([{text: STR_TODO.replace("_ENTITY_", "method")}]);
                }
            });
            return javadocFileDataLines;
        }

        function getEntity(e, t) {
            if (t === ENTITY_TYPE._CLASS) return getClass(e);
            if (t === ENTITY_TYPE._CLASSNODOCS) return getClassNoDocs(e);
            if (t === ENTITY_TYPE._METHOD) return getMethod(e);
            if (t === ENTITY_TYPE._PROPERTY) return getProp(e);
            return undefined;
        }

        function getProp(e) {

            var ret = {
                name: "Property",
                toc: e[5],
                text: e[5],
                type: e[4],
                static: e[3] === "static"
            };
            return ret;
        }

        function getMethod(e) {
            var ret = {
                name: "Method",
                toc: e[5] + e[6],
                text: e[3] + ' ' +
                    e[4] + ' ' +
                    e[5] +
                    e[6]
            };
            return ret;
        }

        function getClass(e) {
            var ret = {
                name: "Class",
                toc: e[5],
                text: e[5]
            };
            __LOG__('ret = ' + ret);
            return ret;
        }

        function getClassNoDocs(e) {
            var ret = {
                name: "Class",
                toc: e[4],
                text: e[4]
            };
            return ret;
        }

        function escapeAngleBrackets(str) {
            return str.replace(/([\<\>])/g, function(match) {
                return `\\${match}`
            });
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
                    var firstProp = true;
                    for (var a = 0; a < docCommentsFile.length; a++) {
                        var commentData = docCommentsFile[a];
                        var firstParam = true;
                        if (commentData === null) break;
                        for (var b = 0; b < commentData.length; b++) {
                            (function(commentData) {
                                var name = commentData[b].name === undefined ? "" : commentData[b].name.replace(/^@/g, "");
                                var text = commentData[b].text === undefined ? "" : commentData[b].text.replace(/\n/g, "");
                                var type = commentData[b].type === undefined ? "" : commentData[b].type.replace(/\n/g, "");
                                var toc = commentData[b].toc === undefined ? "" : commentData[b].toc.replace(/\n/g, "");

                                if (name.length) {
                                    name = name[0].toUpperCase() + name.substr(1);
                                }
                                if (name === 'Class') {
                                    tocData += (`\n1. [${toc} class](#${toc.replace(/\s/g, "-")}-class)`);
                                    text = `\n---\n### ${text} class (${file})`;
                                } else if (name === 'Method') {
                                    tocData += (`\n   * ${escapeAngleBrackets(toc)}`);
                                    text = `#### ${escapeAngleBrackets(text)}`;
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
                                } else if (name === "Property") {
                                    if (firstProp) {
                                        data += '\n####Properties\n|Static?|Type|Property|\n|:---|:---|:---|\n';
                                        firstProp = false;
                                    }
                                    var static = commentData[b].static ? "Yes" : " ";
                                    text = `|${static}|${type}|${text}|`;
                                } else if (name === "Author") {
                                    text = "";
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
                __LOG__("Matched lines in file " + file + ": " + javadocMatches.length);
                if (javadocMatches.length !== 0) {
                    docComments[file] = javadocMatches;
                }
            }
            return docComments;
        };
    }
};