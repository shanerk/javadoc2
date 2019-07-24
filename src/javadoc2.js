module.exports = {
  generate: function generate(optionsArg) {
    let options = undefined;
    let currentClassIsTest = undefined;

    const REGEX_JAVADOC = /\/\*\*(?:[^\*]|\*(?!\/))*.*?\*\//gm;
    const REGEX_ATTRIBUTES = /(?:\@[^\n]*[\s]+)*/gm;
    const REGEX_WS = /\s*/;
    const REGEX_BEGINING_AND_ENDING = /^\/\*\*[\t ]*\n|\n[\t ]*\*+\/$/g;
    const REGEX_JAVADOC_LINE_BEGINING = /\n[\t ]*\*[\t ]?/g;
    const REGEX_JAVADOC_LINE_BEGINING_ATTRIBUTE = /^\@[^\n\t\r ]*/g;
    const REGEX_JAVADOC_CODE_BLOCK = /{@code((?:\s(?!(?:^}))|\S)*)/gm;

    const REGEX_CLASS_NODOC = new RegExp(
      REGEX_ATTRIBUTES.source +
      /([\w]+)\s*([\w\s]*)\s+(class|enum)+\s*([\w]+)\s*((?:extends)* [^\n]*)*\s*{/.source,
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
      PROPERTY: 3
    }

    /** Main **********************************************************************************************************/

    return (function () {
      normalizeOptions();
      let raw = iterateFiles();
      let data = formatOutput(raw);
      return data;
    })();

    /** Normalize Options *********************************************************************************************/

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

    /** Parse File ****************************************************************************************************/

    function parseFile(text) {
      let fileData = [];
      let classData = [];
      let classes = [];
      let i = 0;

      classData = merge(
        matchAll(text, REGEX_CLASS),
        matchAll(text, REGEX_CLASS_NODOC),
        4,
        4
      ).sort(EntityComparator);
      classData = filter(classData);

      __LOG__("Classes = " + classData.length);

      classData.forEach(function(data) {
        let c = getClass(data);
        classes.push(c);
      });

      classes = setLevels(classes).sort(ClassLevelComparator);
      classes = setClassPaths(classes);

      classData.forEach(function(data) {
        let parsedClass = parseData([data], ENTITY_TYPE.CLASS, classes[i]);
        __LOG__("Class = " + classes[i].path);
        if (fileData.length === 0) {
          fileData = parsedClass;
        } else {
          fileData = fileData.concat(parsedClass);
        }
        let members = parseClass(classes[i].body);
        if (members !== undefined) fileData = fileData.concat(members);
        i++;
      });

      return fileData;
    }

    /** Parse Class ***************************************************************************************************/

    function parseClass(text) {
      let classBodyData = [];
      // Handle Properties
      let propertyData = merge(
        matchAll(text, REGEX_PROPERTY),
        matchAll(text, REGEX_PROPERTY_NODOC),
        4,
        4
      ).sort(EntityComparator);
      propertyData = filter(propertyData);
      __LOG__("Properties = " + propertyData.length);

      if (propertyData.length > 0) {
        classBodyData = classBodyData.concat(parseData(propertyData, ENTITY_TYPE.PROPERTY));
      }

      // Handle Methods
      let methodData = merge(
        matchAll(text, REGEX_METHOD),
        matchAll(text, REGEX_METHOD_NODOC),
        4,
        4
      ).sort(EntityComparator);
      methodData = filter(methodData);
      __LOG__("Methods = " + methodData.length);

      if (methodData.length > 0) {
        classBodyData = classBodyData.concat(parseData(methodData, ENTITY_TYPE.METHOD));
      }

      return classBodyData;
    };

    /** Parse Data ****************************************************************************************************/

    function parseData(javadocData, entityType, header) {
      let javadocFileDataLines = [];

      javadocData.forEach(function (data) {
        let lastObject = {
          name: "default",
          text: ""
        };
        let javadocCommentData = [];

        if (entityType === ENTITY_TYPE.CLASS) {
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

        let entityHeader = header === undefined ? getEntity(data, entityType) : header;

        // Skip invalid entities, or entities that have non-included accesors (see getEntity() method)
        if (entityHeader === undefined) return;

        // Process Javadocs, if any
        if (data[0].match(REGEX_JAVADOC) !== null) {
          let javadocCommentClean = "\n" + data[0].split("*/")[0].replace(REGEX_BEGINING_AND_ENDING, "");
          let javadocLines = javadocCommentClean.split(REGEX_JAVADOC_LINE_BEGINING);
          let attributeMatch = "default";

          javadocLines.forEach(function (javadocLine) {
            let attrMatch = javadocLine.match(REGEX_JAVADOC_LINE_BEGINING_ATTRIBUTE);
            let isNewMatch = (!!attrMatch);
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
          lastObject.text = lastObject.text.replace(/\/\*\*( )*/g,``);
          javadocCommentData.push(lastObject);
        } else {
          javadocCommentData.push({ name: "todo", text: STR_TODO.replace("_ENTITY_", entityHeader.name) });
        }

        // Javadocs are pushed onto the stack after the header for all entity types except: Property, Enum
        if (entityType != ENTITY_TYPE.PROPERTY && entityHeader.name != "enum") {
          javadocFileDataLines.push([entityHeader]);
          javadocFileDataLines.push(javadocCommentData);
        } else {

          // For Property & Enum entities, add the javadoc as the descrip
          entityHeader.descrip = javadocCommentData[0].text;
          javadocFileDataLines.push([entityHeader]);
        }
      });
      return javadocFileDataLines;
    }

    /** Format Output *************************************************************************************************/

    function formatOutput(docComments) {
      const fs = require("fs");
      const path = require("path");
      const mkdirp = require('mkdirp');
      let data = undefined;
      __DBG__('formatData format = ' + options.format);
      if (options.format === "markdown") {
        let tocData = "";
        data = "";

        for (let file in docComments) {
          let docCommentsFile = docComments[file];
          let firstProp = true;
          for (let a = 0; a < docCommentsFile.length; a++) {
            let commentData = docCommentsFile[a];
            let firstParam = true;
            if (commentData === null || commentData === undefined) break;
            for (let b = 0; b < commentData.length; b++) {
              (function (commentData) {
                /** Stage the data */
                let entityType = commentData[b].name === undefined ? "" : commentData[b].name.replace(/^@/g, "");
                let text = commentData[b].text === undefined ? "" : commentData[b].text.replace(/\n/gm, " ");
                let entitySubtype = commentData[b].type === undefined ? "" : commentData[b].type.replace(/\n/gm, " ");
                let entityName = commentData[b].toc === undefined ? "" : commentData[b].toc.replace(/\n/gm, " ");
                let classPath = commentData[b].path === undefined ? "" : commentData[b].path.replace(/\n/gm, " ");
                let body = commentData[b].body === undefined ? "" : commentData[b].body;
                let descrip = commentData[b].descrip === undefined ? "" : commentData[b].descrip.replace(/\n/gm, " ");
                let codeBlock = matchAll(commentData[b].text, REGEX_JAVADOC_CODE_BLOCK);

                __DBG__(`type = ${entityType} text = ${text}`);

                /** Code Blocks */
                if (codeBlock.length > 0 && codeBlock[0] !== undefined) {
                  text = "";
                  codeBlock.forEach(function(block) {
                    text += "\n##### Example:\n```" + getLang(file) + undentBlock(block[1]) + "```\n";
                  });
                }

                if (entityType.length) {
                  entityType = entityType[0].toUpperCase() + entityType.substr(1);
                }

                /** Classes & Enums */
                if (entityType === 'Class' || entityType === 'Enum') {
                  entityType = entityType.toLowerCase(entityType);
                  tocData += (`\n1. [${classPath} ${entityType}](#${classPath.replace(/\s/g, "-")}-${entityType})`);
                  text = `\n---\n### ${classPath} ${entityType}`;

                  /** Enum values  */
                  if (entityType === 'enum' && body !== undefined) {
                    text += `\n${descrip}`;
                    text += '\n\n|Values|\n|:---|';
                    getEnumBody(body).forEach(function (enumText) {
                      text += `\n|${enumText}|`
                    });
                  }

                /** Methods */
                } else if (entityType === 'Method') {
                  tocData += (`\n   * ${escapeAngleBrackets(entityName)}`);
                  text = `#### ${escapeAngleBrackets(text)}`;

                /** Parameters */
                } else if (entityType === "Param") {
                  if (firstParam) {
                    data += '\n##### Parameters:\n\n|Type|Name|Description|\n|:---|:---|:---|\n';
                    firstParam = false;
                  }
                  let pname = text.substr(0, text.indexOf(" "));
                  let descrip = text.substr(text.indexOf(" "));
                  text = `|${entityType}|${pname}|${descrip}|`;

                /** Return values */
                } else if (entityType === "Return") {
                  if (firstParam) {
                    data += '\n|Type|Name|Description|\n|:---|:---|:---|\n';
                    firstParam = false;
                  }
                  text = `|${entityType}| |${text}|`;

                /** Properties */
                } else if (entityType === "Property") {
                  if (firstProp) {
                    data += '\n#### Properties\n\n|Static?|Type|Property|Description|' +
                      '\n|:---|:---|:---|:---|\n';
                    firstProp = false;
                  }
                  let static = commentData[b].static ? "Yes" : " ";
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
        /** File header */
        data = "# API Reference\n" + tocData + "\n" + data;
      } else {
        data = JSON.stringify(docComments, null, 4);
      }

      if (options.output === undefined) {
        console.log(data);

      /** Write out to the specified file */
      } else {
        __LOG__("Writing results to: " + options.output);
        let folder = path.dirname(options.output);
        if (fs.existsSync(folder)) {
          if (fs.lstatSync(folder).isDirectory()) {
            fs.writeFileSync(options.output, data, "utf8");
          } else {
            throw {
              name: "DumpingResultsError",
              message: "Destination folder is already a file"
            };
          }
        } else {
          mkdirp.sync(folder);
          fs.writeFileSync(options.output, data, "utf8");
        }
      }
      return data;
    };

    /** Iterate Files *************************************************************************************************/

    function iterateFiles() {
      const globule = require("globule");
      const fs = require("fs");
      let docComments = {};
      __LOG__("Starting.");
      __LOG__("Files:", options.include);
      __LOG__("Excluded:", options.exclude);
      __LOG__("Output:", options.output);
      __LOG__("Format:", options.format);
      __LOG__("Accessors:", options.accessors);
      const files = globule.find([].concat(options.include).concat(options.exclude));
      __LOG__("Files found: " + files.length);
      for (let a = 0; a < files.length; a++) {
        let file = files[a];
        __LOG__("File: " + file);
        let contents = fs.readFileSync(file).toString();
        let javadocMatches = parseFile(contents);
        if (javadocMatches.length !== 0) {
          docComments[file] = javadocMatches;
        }
      }
      return docComments;
    };

    /** Utility Methods ***********************************************************************************************/

    function getEnumBody(str) {
      let ret = [];
      if (str === undefined) return ret;
      str = str.replace(/[\s\n]/g,'');
      str = str.substring(str.indexOf(`{`)+1, str.indexOf(`}`));
      ret = str.split(`,`);
      return ret;
    }

    function matchAll(str, regexp) {
      let ret = [];
      let result = undefined;
      while (result = regexp.exec(str)) {
        ret.push(result);
      }
      return ret;
    }

    function filter(data) {
      let ret = [];
      data.forEach(function (item) {
        if (options.accessors.includes(item[1])) ret.push(item);
      });
      if (ret.length < data.length)
        __DBG__("Filtered out " + (data.length - ret.length) + " entities based on accessors.");
      return ret;
    }

    function merge(data1, data2, key1, key2) {
      let keys = [];
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

    function ClassLevelComparator(a, b) {
      if (a.level < b.level) return -1;
      if (a.level > b.level) return 1;
      return 0;
    }

    function getEntity(data, entityType) {
      let ret = undefined;
      if (entityType === ENTITY_TYPE.CLASS) ret = getClass(data);
      if (entityType === ENTITY_TYPE.METHOD) ret = getMethod(data);
      if (entityType === ENTITY_TYPE.PROPERTY) ret = getProp(data);
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
        static: data[2] === "static",
        line: getLineNumber(data),
        start: data.index
      };
      return ret;
    }

    function getMethod(data) {
      data[2] = data[2] === "override" ? "" : data[2];
      let ret = {
        name: "Method",
        accessor: data[1],
        toc: data[4] + data[5],
        text: data[2] + ' ' +
          data[3] + ' ' +
          data[4] +
          data[5],
        line: getLineNumber(data),
        start: data.index
      };
      return ret;
    }

    function getClass(data) {
      let endIndex = getEndIndex(data);
      let ret = {
        name: data[3], // Class or Enum
        accessor: data[1],
        toc: data[4],
        text: data[4],
        body: data.input.substring(data.index, endIndex),
        line: getLineNumber(data),
        signature: (data[1] + " " + data[2] + " " + data[3] + " " + data[4]).replace("  ", " ") + " ",
        start: data.index,
        end: endIndex,
        path: "",
        descrip: "",
        level: undefined
      };
      __DBG__(`class = ${JSON.stringify(ret)}`);
      return ret;
    }

    function setLevels(classes) {
      classes.forEach(function(cur) {
        cur.level = recLevel(cur, classes.slice(0), 0);
      });
      return classes;
    }

    function recLevel(target, classes, level) {
      classes.forEach(function(cur) {
        if (target !== cur) {
          let child = cur.body.includes(target.signature);
          if (child) {
            level = recLevel(cur, classes, level + 1);
          } else {
            classes = classes.splice(classes.indexOf(target), 1);
          }
        }
      });
      return level;
    }

    function setClassPaths(classes) {
      classes.forEach(function(cur) {
        cur.path = recPath(cur, cur.path, classes.slice(0), 0) + cur.toc;
      });
      return classes;
    }

    function recPath(target, path, classes, level) {
      classes.forEach(function(cur) {
        if (target !== cur) {
          let child = cur.body.includes(target.signature);
          if (child) {
            path += recPath(cur, cur.toc, classes, level + 1) + ".";
          } else {
            classes = classes.splice(classes.indexOf(target), 1);
          }
        }
      });
      return path;
    }

    function getLineNumber(data) {
      if (data.index === 0) return 1;
      let codeBlock = data.input.substr(0, data.index);
      let lineNum = (codeBlock.match(/\n/g || []).length) + 1;
      return lineNum;
    }

    function getEndIndex(data) {
      const REGEX_STRING = /([\"'`])(?:[\s\S])*?(?:(?<!\\)\1)/gm;

      let codeBlock = data.input.substring(data.index, data.input.length);

      // Replace string literals with spaces to prevent non-code matches
      codeBlock = codeBlock.replace(REGEX_STRING, function(match, p1) {
        return p1 + "".padStart(match.length - 2) + p1;
      });

      // Replace comment bodies with spaces to prevent non-code matches
      codeBlock = codeBlock.replace(REGEX_JAVADOC, function(match, p1) {
        return "/**" + "".padStart(match.length - 5) + "*/";
      });

      let ob = 0;
      let cb = 0;
      let endIndex = undefined;

      for(let i = 0; i < codeBlock.length; i++) {
        if (codeBlock.charAt(i) === "{") ob++;
        if (codeBlock.charAt(i) === "}") cb++;
        if (ob !== 0 && cb !== 0 && ob === cb) {
          endIndex = i + data.index + 1;
          break;
        };
      }
      return endIndex;
    }

    function escapeAngleBrackets(str) {
      return str.replace(/([\<\>])/g, function (match) {
        return `\\${match}`
      });
    }

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
      for (let i = 0; i < str.length; i++) {
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

    function __DBG__(msg) {
      ///*
      let otherArgs = Array.prototype.slice.call(arguments);
      otherArgs.shift();
      console.log.apply(console, ["[DEBUGGING] " + msg].concat(otherArgs));
      //*/
    }

    function __LOG__(msg) {
      if (options.output === undefined) {
        return;
      }
      let otherArgs = Array.prototype.slice.call(arguments);
      otherArgs.shift();
      console.log.apply(console, ["[javadoc2] " + msg].concat(otherArgs));
    }
  }
}