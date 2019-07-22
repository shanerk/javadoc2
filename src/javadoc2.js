module.exports = {
  generate: function generate(optionsArg) {
    var options = undefined;
    var methodData = undefined;
    var propertyData = undefined;
    var classData = undefined;
    var currentClassIsTest = undefined;
    var isIgnorePrivate = true;

    const REGEX_JAVADOC = /\/\*\*(?:[^\*]|\*(?!\/))*.*?\*\//gm;
    const REGEX_ATTRIBUTES = /(?:\@[^\n]*[\s]+)*/gm;
    const REGEX_WS = /\s*/;
    const REGEX_BEGINING_AND_ENDING = /^\/\*\*[\t ]*\n|\n[\t ]*\*+\/$/g;
    const REGEX_JAVADOC_LINE_BEGINING = /\n[\t ]*\*[\t ]?/g;
    const REGEX_JAVADOC_LINE_BEGINING_ATTRIBUTE = /^\@[^\n\t\r ]*/g;
    const REGEX_JAVADOC_CODE_BLOCK = /{@code((?:\s(?!(?:^}))|\S)*)/gm;

    const REGEX_CLASS_NODOC = new RegExp(
      REGEX_ATTRIBUTES.source +
      /([\w]+)\s*([\w\s]*)\s+(class|enum)+\s*([\w]+)\s*((?:extends)* [^\n]*)*\s*{([^}]*)}/.source,
      'gm'
    );
    const REGEX_CLASS = new RegExp(REGEX_JAVADOC.source + REGEX_WS.source + REGEX_CLASS_NODOC.source, 'gm');
    __DBG__('REGEX_CLASS = ' + REGEX_CLASS);

    const REGEX_METHOD_NODOC = new RegExp(
      REGEX_ATTRIBUTES.source +
      /([\w]+)[ \t]*([\w]*)[ \t]+([\w\<\>\[\]\, ]*)[ \t]+([\w]+)[ \t]*(\([^\)]*\))\s*(?:[{])/.source,
      'gm'
    );
    const REGEX_METHOD = new RegExp(REGEX_JAVADOC.source + REGEX_WS.source + REGEX_METHOD_NODOC.source, 'gm');
    __DBG__('REGEX_METHOD = ' + REGEX_METHOD);


    const REGEX_PROPERTY_NODOC = new RegExp(
      REGEX_ATTRIBUTES.source +
      /(global|public)\s*(static|final|const)*\s+([\w\s\[\]<>,]+)\s+([\w]+)\s*(?:{\s*get([^}]+)}|(?:=[\w\s\[\]<>,{}'=()]*)|;)+/.source,
      'gm'
    );
    const REGEX_PROPERTY = new RegExp(REGEX_JAVADOC.source + REGEX_WS.source + REGEX_PROPERTY_NODOC.source, 'gm');
    __DBG__('REGEX_PROPERTY = ' + REGEX_PROPERTY);

    const STR_TODO = "TODO: No documentation currently exists for this _ENTITY_.";

    const ENTITY_TYPE = {
      CLASS: 1,
      METHOD: 2,
      CLASSNODOCS: 3,
      PROPERTY: 4
    }

    // Main
    return (function () {
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
      options.exclude = [].concat(options.exclude).map(function (item) {
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
      // TODO: Refactor this to use merge() instead, and eliminate CLASSNODOCS entity type
      classData = matchAll(text, REGEX_CLASS);
      classData = filter(classData);

      if (classData.length > 0) {
        logOutput += 'Class matches: ' + classData.length + ' ';
        javadocFileData = parseData(classData, ENTITY_TYPE.CLASS);
      } else {
        // No Javadoc?  No Problem!
        classData = matchAll(text, REGEX_CLASS_NODOC);
        classData = filter(classData);
        if (classData.length > 0) {
          logOutput += 'Class matches: ' + classData.length + ' ';
          javadocFileData = parseData(classData, ENTITY_TYPE.CLASSNODOCS);
        }
      }
      __DBG__("Classes = " + classData.length);

      // Handle Properties
      propertyData = merge(
        matchAll(text, REGEX_PROPERTY),
        matchAll(text, REGEX_PROPERTY_NODOC),
        4,
        4
      ).sort(EntityComparator);
      propertyData = filter(propertyData);
      __DBG__("Properties = " + propertyData.length);

      if (propertyData.length > 0) {
        logOutput += 'Property matches: ' + propertyData.length + ' ';
        javadocFileData = javadocFileData.concat(parseData(propertyData, ENTITY_TYPE.PROPERTY));
      }

      // Handle Methods
      methodData = merge(
        matchAll(text, REGEX_METHOD),
        matchAll(text, REGEX_METHOD_NODOC),
        4,
        4
      ).sort(EntityComparator);
      methodData = filter(methodData);
      __DBG__("Methods = " + methodData.length);

      if (methodData.length > 0) {
        logOutput += 'Method matches: ' + methodData.length;
        javadocFileData = javadocFileData.concat(parseData(methodData, ENTITY_TYPE.METHOD));
      }

      // Output to the logger
      if (logOutput.length > 0) {
        __LOG__(logOutput);
      } else {
        __LOG__('No matches');
      }

      return javadocFileData;
    };

    function filter(data) {
      let ret = [];
      data.forEach(function (item) {
        if (options.accessors.includes(item[1])) ret.push(item);
      });
      if (ret.length < data.length) __DBG__("Filtered out " + (data.length - ret.length) + " entities based on accessors.");
      return ret;
    }

    function merge(data1, data2, key1, key2) {
      var keys = [];
      data1.forEach(function (item) {
        keys.push(item[key1]);
      });
      data2.forEach(function (item) {
        if (!keys.includes(item[key2])) {
          data1.push(item);
        }
      });
      return data1;
    }

    function EntityComparator(a, b) {
      if (a[4] < b[4]) return -1;
      if (a[4] > b[4]) return 1;
      return 0;
    }

    function parseData(fileData, entityType) {
      var javadocFileDataLines = [];

      fileData.forEach(function (data) {
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

          javadocLines.forEach(function (javadocLine) {
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
                  .replace(/(\*)( )+(\/)/g, function (match) {
                    return match.substr(0, 1) + match.substr(1, match.length - 3) + match.substr(match.length - 1);
                  })
              };
            } else {
              lastObject.text += "\n" + javadocLine
                .replace(/^ /g, "")
                .replace(/(\*)( )+(\/)/g, function (match) {
                  return match.substr(0, 1) + match.substr(1, match.length - 3) + match.substr(match.length - 1);
                });
            }
          });
          javadocCommentData.push(lastObject);
        } else {
          // Add TODO for all types except: Enum
          if (entityHeader.name !== "enum") {
            javadocCommentData.push({ text: STR_TODO.replace("_ENTITY_", entityHeader.name) });
          }
        }

        // Javadocs are pushed onto the stack after the header for all entity types except: Property
        if (entityType != ENTITY_TYPE.PROPERTY) {
          javadocFileDataLines.push([entityHeader]);
          javadocFileDataLines.push(javadocCommentData);
        } else {
          // For property entities, add the javadoc right to the object
          entityHeader.descrip = javadocCommentData[0].text;
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
      // if (!options.accessors.includes(ret.accessor)) {
      //   __DBG__("Removing " + ret.text + " because accessor = " + ret.accessor);
      //   return undefined;
      // }
      return ret;
    }

    function getProp(data) {
      let ret = {
        name: "Property",
        accessor: data[1],
        toc: data[4],
        text: data[4],
        type: data[3],
        descrip: "",
        static: data[2] === "static"
      };
      return ret;
    }

    function getMethod(data) {
      data[2] = data[2] === "override" ? "" : data[2];
      var ret = {
        name: "Method",
        accessor: data[1],
        toc: data[4] + data[5],
        text: data[2] + ' ' +
          data[3] + ' ' +
          data[4] +
          data[5]
      };
      return ret;
    }

    function getClass(data) {
      var ret = {
        name: data[3], // Class, Enum, etc.
        accessor: data[1],
        toc: data[4],
        text: data[4],
        body: data[6].replace(/\s/g, "") // for Enums
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
      return str.replace(/([\<\>])/g, function (match) {
        return `\\${match}`
      });
    }

    function __DBG__(msg) {
      ///*
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
      let data = undefined;
      __DBG__('formatData format = ' + options.format);
      if (options.format === "markdown") {
        let tocData = "";
        data = "";

        for (var file in docComments) {
          let docCommentsFile = docComments[file];
          let firstProp = true;
          for (var a = 0; a < docCommentsFile.length; a++) {
            let commentData = docCommentsFile[a];
            let firstParam = true;
            if (commentData === null) break;
            for (var b = 0; b < commentData.length; b++) {
              (function (commentData) {
                var entityType = commentData[b].name === undefined ? "" : commentData[b].name.replace(/^@/g, "");
                var text = commentData[b].text === undefined ? "" : commentData[b].text.replace(/\n/gm, " ");
                var entitySubtype = commentData[b].type === undefined ? "" : commentData[b].type.replace(/\n/gm, " ");
                var entityName = commentData[b].toc === undefined ? "" : commentData[b].toc.replace(/\n/gm, " ");
                var body = commentData[b].body === undefined ? "" : commentData[b].body; // Only used for ENUMs, ergo no whitespace in this
                var descrip = commentData[b].descrip === undefined ? "" : commentData[b].descrip.replace(/\n/gm, " ");
                var codeBlock = matchAll(commentData[b].text, REGEX_JAVADOC_CODE_BLOCK);

                if (codeBlock.length > 0 && codeBlock[0] !== undefined) {
                  text = "";
                  codeBlock.forEach(function(block) {
                    // capture group [1] has the raw code sample
                    text += "\n##### Example:\n```" + getLang(file) + undentBlock(block[1]) + "```\n";
                  });
                }

                if (entityType.length) {
                  entityType = entityType[0].toUpperCase() + entityType.substr(1);
                }
                if (entityType === 'Class' || entityType === 'Enum') {
                  entityType = entityType.toLowerCase(entityType);
                  tocData += (`\n1. [${entityName} ${entityType}](#${entityName.replace(/\s/g, "-")}-${entityType})`);
                  text = `\n---\n### ${text} ${entityType}`;
                  if (entityType === 'enum' && body !== undefined) {
                    text += '\n\n|Values|\n|:---|';
                    body.split(',').forEach(function (enumText) {
                      text += `\n|${enumText}|`
                    });
                  }
                } else if (entityType === 'Method') {
                  tocData += (`\n   * ${escapeAngleBrackets(entityName)}`);
                  text = `#### ${escapeAngleBrackets(text)}`;
                } else if (entityType === "Param") {
                  if (firstParam) {
                    data += '\n##### Parameters:\n\n|Type|Name|Description|\n|:---|:---|:---|\n';
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
                  text = `|${entityType}| |${text}|`;
                } else if (entityType === "Property") {
                  if (firstProp) {
                    data += '\n#### Properties\n\n|Static?|Type|Property|Description|' +
                      '\n|:---|:---|:---|:---|\n';
                    firstProp = false;
                  }
                  var static = commentData[b].static ? "Yes" : " ";
                  descrip = descrip.replace(/\/\*\*/g, '');
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

    function getLang(file) {
      if (file.substr(file.length - 4, file.length) === ".cls") return "apex";
    }

    function undentBlock(block) {
      let REGEX_INDEX = /^[ \t]*\**[ \t]+/g;
      let indent = null;
      block.split("\n").forEach(function (line) {
        let match = line.match(REGEX_INDEX);
        let cur = match !== null ? match[0].length : null;
        if (cur < indent || indent === null) indent = cur;
      });
      let ret = "";
      block.split("\n").forEach(function (line) {
        line = undent(line, indent);
        ret += line;
      });
      return ret;
    }

    function undent(str, remove) {
      let ret = "";
      let count = 0;
      for (var i = 0; i < str.length; i++) {
        let c = str.charAt(i);
        if ((c === " ") && count < remove) {
          count++;
        } else {
          break;
        }
      }
      ret = str.substr(count, str.length);
      if (ret === "\n" || ret === " ") ret;
      return ret + "\n";
    }

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