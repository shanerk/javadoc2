module.exports = {
    generate: function generate(optionsArg) {
        var options = undefined;
        var methodData = undefined;
        var propertyData = undefined;
        var classData = undefined;
        var currentClassIsTest = undefined;
        var isIgnorePrivate = true;

        const REGEX_JAVADOC = /\/\*\*[^\n]*\n([\t ]*\*[\t ]*[^\n]*\n)+[\t ]*\*\//g;

        //const REGEX_ENUM = /(\w)*[ \t]+enum[ \t]+(\w)*[ \t]*{/g;
        const REGEX_CLASS = /\/\*\*[^\n]*\n((?:[^\n]*\n)+)[\s]*\*\/\s*(?:\@[^\n]*[\s]+)*^([\w]+)\s*([\w\s]*)\s+(class|enum)+\s*([\w]+)\s*((?:extends)* [^\n]*)*\s*{([^}]*)}/gm;
        const REGEX_CLASS_NODOC = /(?:\@[^\n]*[\s]+)*^([\w]+)\s*([\w\s]*)\s+(class|enum)+\s*([\w]+)\s*((?:extends)* [^\n]*)*\s*{([^}]*)}/gm;
        const REGEX_METHOD = /\/\*\*[^\n]*\n([\t ]*\*[\t ]*[^\n]*\n)+[\t ]*\*\/\s*(?:\@[\w]+\s*)*\s*([\w]+)\s*([\w]*)\s+([\w\<\>\[\]\, \t]*)\s+([\w]+)\s*(\([^\)]*\))\s*(?:[{])/gm;
        const REGEX_METHOD_NODOC = /([ \t])*(?:\@[\w]+\s*)*[ \t]*([\w]+)[ \t]*([\w]*)[ \t]+([\w\<\>\[\]\, ]*)[ \t]+([\w]+)[ \t]*(\([^\)]*\))\s*(?:[{])/gm;
        const REGEX_PROPERTY = /[^\n]\/\*\*[^\n]*\n(?:(?:[^\n]*\n)+)[\s]*\*\/\s*(\@[\w]+[ \t]*)*\s*(global|public)\s*(static|final|const)*\s+([\w\s\[\]<>,]+)\s+([\w]+)\s*((=[\w\s\[\]<>,{}'=()]*)|;)+/gm;
        const REGEX_PROPERTY_NODOC = /(?:[ \t])+(\@[\w]+[ \t]*)*\s*(global|public)\s*(static|final|const)*\s+([\w\s\[\]<>,]+)\s+([\w]+)\s*((=[\w\s\[\]<>,{}'=()]*)|;)+/gm;
        const REGEX_BEGINING_AND_ENDING = /^\/\*\*[\t ]*\n|\n[\t ]*\*+\/$/g;
        const REGEX_JAVADOC_LINE_BEGINING = /\n[\t ]*\*[\t ]?/g;
        const REGEX_JAVADOC_LINE_BEGINING_ATTRIBUTE = /^\@[^\n\t\r ]*/g;
        const REGEX_JAVADOC_CODE_BLOCK = /{@code[\s\S]*\n}/g;

        const STR_TODO = "TODO: No documentation currently exists for this _ENTITY_.";

        const ENTITY_TYPE = {
            CLASS: 1,
            METHOD: 2,
            CLASSNODOCS: 3,
            PROPERTY: 4
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
                format: "markdown",
                accessors: ["global"]
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
            var logOutput = "";

            // Handle Classes
            classData = matchAll(text, REGEX_CLASS);

            if (classData.length > 0) {
                logOutput += 'Class matches: ' + classData.length + ' ';
                javadocFileData = parseData(classData, ENTITY_TYPE.CLASS);
            } else {
                // No Javadoc?  No Problem!
                classData = matchAll(text, REGEX_CLASS_NODOC);
                if (classData.length > 0) {
                    logOutput += 'Class matches: ' + classData.length + ' ';
                    javadocFileData = parseData(classData, ENTITY_TYPE.CLASSNODOCS);
                }
            }

            // Handle Properties
            propertyData = merge(
                matchAll(text, REGEX_PROPERTY),
                matchAll(text, REGEX_PROPERTY_NODOC),
                5,
                5
            ).sort(EntityComparator);

            if (propertyData.length > 0) {
                logOutput += 'Property matches: ' + propertyData.length + ' ';
                javadocFileData = javadocFileData.concat(parseData(propertyData, ENTITY_TYPE.PROPERTY));
            }

            // Handle Methods
            methodData = merge(
                matchAll(text, REGEX_METHOD),
                matchAll(text, REGEX_METHOD_NODOC),
                5,
                5
            ).sort(EntityComparator);

            methodData = filter(methodData);
            if (methodData.length > 0) {
                logOutput += 'Method matches: ' + methodData.length;
                javadocFileData = javadocFileData.concat(parseData(methodData, ENTITY_TYPE.METHOD));
            }

            // Output to the logger
            if (logOutput.length > 0) {
                __LOG__(logOutput)
            } else {
                __LOG__('No matches');
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

        function EntityComparator(a, b) {
            if (a[5] < b[5]) return -1;
            if (a[5] > b[5]) return 1;
            return 0;
          }

        function parseData(fileData, entityType) {
            var javadocFileDataLines = [];

            fileData.forEach(function(data) {
                var lastObject = {
                    name: "default",
                    text: ""
                };
                var javadocCommentData = [];

                if (entityType === ENTITY_TYPE.CLASS || entityType === ENTITY_TYPE.CLASSNODOCS) {
                    if (data[0].indexOf('@IsTest') !== -1) {
                        currentClassIsTest = true;
                        return;
                    } else {
                        currentClassIsTest = false;
                    }
                }

                // Skip test methods and methods within test classes
                if (entityType === ENTITY_TYPE.METHOD &&
                    (data[0].indexOf('@IsTest') !== -1 || currentClassIsTest)
                    ) return;

                var entityHeader = getEntity(data, entityType);

                // Skip invalid entities, or entities that have non-included accesors (see getEntity() method)
                if (entityHeader === undefined) return;

                // Process Javadocs, if any
                if (data[0].match(REGEX_JAVADOC) !== null) {
                    var javadocCommentClean = "\n" + data[0].split("*/")[0].replace(REGEX_BEGINING_AND_ENDING, "");
                    var javadocLines = javadocCommentClean.split(REGEX_JAVADOC_LINE_BEGINING);
                    var attributeMatch = "default";

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
                } else {
                    javadocCommentData.push({text: STR_TODO.replace("_ENTITY_", entityHeader.name)});
                }

                if (entityType != ENTITY_TYPE.PROPERTY) {
                    javadocFileDataLines.push([entityHeader]);
                    javadocFileDataLines.push(javadocCommentData);
                } else {
                    __LOG__('224 javadocCommentData = ' + JSON.stringify(javadocCommentData));
                    entityHeader.descrip = javadocCommentData[0].text; // For property entities, add the javadoc right to the object
                    javadocFileDataLines.push([entityHeader]);
                }
            });
            return javadocFileDataLines;
        }

        function getEntity(data, entityType) {
            let ret = undefined;
            if (entityType === ENTITY_TYPE.CLASS) ret = getClass(data);
            if (entityType === ENTITY_TYPE.CLASSNODOCS) ret = getClassNoDocs(data);
            if (entityType === ENTITY_TYPE.METHOD) ret = getMethod(data);
            if (entityType === ENTITY_TYPE.PROPERTY) ret = getProp(data);
            if (!options.accessors.includes(ret.accessor)) return undefined;
            return ret;
        }

        function getProp(data) {
            let ret = {
                name: "Property",
                accessor: data[2],
                toc: data[5],
                text: data[5],
                type: data[4],
                descrip: "",
                static: data[3] === "static"
            };
            return ret;
        }

        function getMethod(data) {
            var ret = {
                name: "Method",
                accessor: data[2],
                toc: data[5] + data[6],
                text: data[3] + ' ' +
                    data[4] + ' ' +
                    data[5] +
                    data[6]
            };
            return ret;
        }

        function getClass(data) {
            var ret = {
                name: data[4], // Class, Enum, etc.
                accessor: data[2],
                toc: data[5],
                text: data[5],
                body: data[7].replace(/\s/g, "") // for Enums
            };
            return ret;
        }

        function getClassNoDocs(data) {
            var ret = {
                name: data[3], // Class, Enum, etc.
                accessor: data[1],
                toc: data[4],
                text: data[4],
                body: data[6].replace(/\s/g, "") // for Enums
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

                                var entityType = commentData[b].name === undefined ? "" : commentData[b].name.replace(/^@/g, "");
                                var text = commentData[b].text === undefined ? "" : commentData[b].text.replace(/\n/gm, " ");
                                var entitySubtype = commentData[b].type === undefined ? "" : commentData[b].type.replace(/\n/gm, " ");
                                var entityName = commentData[b].toc === undefined ? "" : commentData[b].toc.replace(/\n/gm, " ");
                                var body = commentData[b].body === undefined ? "" : commentData[b].body;
                                var descrip = commentData[b].descrip === undefined ? "" : commentData[b].descrip;
                                var codeBlock = matchAll(commentData[b].text, REGEX_JAVADOC_CODE_BLOCK);

                                //__LOG__("commentData[b] = " + JSON.stringify(commentData[b]));

                                if (codeBlock.length > 0 && codeBlock[0] !== undefined) {
                                    codeBlock = "" + codeBlock[0];
                                    var stripped = codeBlock.replace(/\n/gm, "");
                                    text = text.replace(stripped, "\n#####Example:\n```" + codeBlock.replace(/{@code|\n}\n/g, "") + "\n```\n");
                                }

                                if (entityType.length) {
                                    entityType = entityType[0].toUpperCase() + entityType.substr(1);
                                }
                                if (entityType === 'Class' || entityType === 'Enum') {
                                    tocData += (`\n1. [${entityName} ${entityType}](#${entityName.replace(/\s/g, "-")}-${entityType})`);
                                    text = `\n---\n### ${text} ${entityType} (${file.substring(file.lastIndexOf('/')+1)})`;
                                    if (entityType === 'Enum' && body !== undefined) {
                                        data += '\n#####Values:\n|Name|\n|:---|';
                                        body.split(',').forEach(function(enumText) {
                                            data += `\n|${enumText}|`
                                        });
                                    }
                                } else if (entityType === 'Method') {
                                    tocData += (`\n   * ${escapeAngleBrackets(entityName)}`);
                                    text = `#### ${escapeAngleBrackets(text)}`;
                                } else if (entityType === "Param") {
                                    if (firstParam) {
                                        data += '\n#####Parameters:\n|Type|Name|Description|\n|:---|:---|:---|\n';
                                        firstParam = false;
                                    }
                                    var pname = text.substr(0, text.indexOf(" "));
                                    var descrip = text.substr(text.indexOf(" "));
                                    text = `|${entityType}|${pname}|${descrip}|`;
                                } else if (entityType === "Return") {
                                    if (firstParam) {
                                        data += '\n|Type|Name|Description|\n|:---|:---|:---|\n';
                                        firstParam = false;
                                    }
                                    text = `|${entityType}|n/a|${text}|`;
                                } else if (entityType === "Property") {
                                    if (firstProp) {
                                        data += '\n####Properties\n|Static?|Type|Property|Description|' +
                                            '\n|:---|:---|:---|:---|\n';
                                        firstProp = false;
                                    }
                                    var static = commentData[b].static ? "Yes" : " ";
                                    text = `|${static}|${entitySubtype}|${text}|${descrip}|`;
                                } else if (entityType === "Author") {
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
            __LOG__("Files:", options.include);
            __LOG__("Excluded:", options.exclude);
            __LOG__("Output:", options.output);
            __LOG__("Format:", options.format);
            __LOG__("Accessors:", options.accessors);
            const files = globule.find([].concat(options.include).concat(options.exclude));
            __LOG__("Files found: " + files.length);
            for (var a = 0; a < files.length; a++) {
                var file = files[a];
                __LOG__("File: " + file);
                var contents = fs.readFileSync(file).toString();
                var javadocMatches = extractJavadocData(contents);
                if (javadocMatches.length !== 0) {
                    docComments[file] = javadocMatches;
                }
            }
            return docComments;
        };
    }
};