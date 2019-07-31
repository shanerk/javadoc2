module.exports = {
  generate: function generate(optionsArg) {
    let options = undefined;
    let isTestClass = false;
    let isDeprecatedClass = false;

    const REGEX_JAVADOC = /\/\*\*(?:[^\*]|\*(?!\/))*.*?\*\//gm;
    const REGEX_ATTRIBUTES = /(?:\@[^\n]*[\s]+)*/gm;
    const REGEX_WS = /\s*/;
    const REGEX_BEGINING_AND_ENDING = /^\/\*\*[\t ]*\n|\n[\t ]*\*+\/$/g;
    const REGEX_JAVADOC_LINE_BEGINING = /\n[\t ]*\*[\t ]?/g;
    const REGEX_JAVADOC_LINE_BEGINING_ATTRIBUTE = /^\@[^\n\t\r ]*/g;
    const REGEX_JAVADOC_CODE_BLOCK = /{@code((?:\s(?!(?:^}))|\S)*)\s*}/gm;

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
        matchAll(text, REGEX_CLASS, true),
        matchAll(text, REGEX_CLASS_NODOC, true),
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
      // bodyx holds the class definition text minus the text of sub-classes
      classes = setClassBodyX(classes);

      classData.forEach(function(data) {
        let parsedClass = parseData([data], ENTITY_TYPE.CLASS, classes[i]);
        __LOG__("Class = " + classes[i].path);
        if (fileData.length === 0) {
          fileData = parsedClass;
        } else {
          fileData = fileData.concat(parsedClass);
        }
        let members = parseClass(classes[i]);
        if (members !== undefined) fileData = fileData.concat(members);
        i++;
      });

      return fileData;
    }

    /** Parse Class ***************************************************************************************************/

    function parseClass(target) {
      let classBodyData = [];
      // Handle Properties
      let propertyData = merge(
        matchAll(target.bodyx, REGEX_PROPERTY, true),
        matchAll(target.bodyx, REGEX_PROPERTY_NODOC, true),
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
        matchAll(target.bodyx, REGEX_METHOD, true),
        matchAll(target.bodyx, REGEX_METHOD_NODOC, true),
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
          if (data[0].includes('@IsTest')) {
            isTestClass = true;
            return;
          }
          isDeprecatedClass = data[0].includes(`@Deprecated`) && header.level === 0;
        }

        // Skip test entities
        if (
          (data[0].indexOf('@IsTest') !== -1 ||
          isTestClass ||
          isDeprecatedClass) &&
          entityType !== ENTITY_TYPE.CLASS) {
            return;
        }

        let entityHeader = header === undefined ? getEntity(data, entityType) : header;

        // Skip invalid entities, or entities that have non-included accesors (see getEntity() method)
        if (entityHeader === undefined) return;

        // Process Javadocs, if any
        if (data[0].match(REGEX_JAVADOC) !== null && !entityHeader.isDeprecated) {
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
          if (entityHeader.isJavadocRequired && !entityHeader.isDeprecated) {
            javadocCommentData.push({ name: "todo", text: STR_TODO.replace("_ENTITY_", entityHeader.name) });
          }
        }

        // Javadocs are pushed onto the stack after the header for all entity types except: Property, Enum
        if (entityType != ENTITY_TYPE.PROPERTY && entityHeader.name != "enum") {
          javadocFileDataLines.push([entityHeader]);
          javadocFileDataLines.push(javadocCommentData);
        } else {
          // For Property & Enum entities, add the javadoc as the descrip
          if (!entityHeader.isDeprecated) entityHeader.descrip = javadocCommentData[0].text;
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
      if (options.format === "markdown") {
        let tocData = "";
        data = "";

        for (let file in docComments) {
          let docCommentsFile = docComments[file];
          let firstProp = true;
          let firstParam = true;
          for (let a = 0; a < docCommentsFile.length; a++) {
            let cdataList = docCommentsFile[a];
            if (cdataList === null || cdataList === undefined) break;
            for (let b = 0; b < cdataList.length; b++) {
              (function (cdata) {
                /** Stage the data */
                let entityType = cdata[b].name === undefined ? "" : cdata[b].name.replace(/^@/g, "");
                let text = cdata[b].text === undefined ? "" : cdata[b].text.replace(/\n/gm, " ").trim();
                let entitySubtype = cdata[b].type === undefined ? "" : cdata[b].type.replace(/\n/gm, " ");
                let entityName = cdata[b].toc === undefined ? "" : cdata[b].toc.replace(/\n/gm, " ");
                let classPath = cdata[b].path === undefined ? "" : cdata[b].path.replace(/\n/gm, " ");
                let body = cdata[b].body === undefined ? "" : cdata[b].body;
                let descrip = cdata[b].descrip === undefined ? "" : cdata[b].descrip.replace(/\n/gm, " ").trim();
                let codeBlock = matchAll(cdata[b].text, REGEX_JAVADOC_CODE_BLOCK);
                let deprecated = cdata[b].isDeprecated ||
                  (isDeprecatedClass && cdata[b].level > 0) ? ` (deprecated)` : ``;

                /** Proper-case entityType */
                if (entityType.length) {
                  entityType = entityType[0].toUpperCase() + entityType.substr(1);
                }
                if (entityType === `Class`) {
                  firstProp = true;
                }
                if (entityType === `Method`) {
                  firstParam = true;
                }

                /** Code Blocks */
                if (codeBlock.length > 0 && codeBlock[0] !== undefined) {
                  codeBlock.forEach(function(block) {
                    text = text.replace(block[0].replace(/\n/gm, ` `),
                      "\n##### Example:\n```" + getLang(file) + undentBlock(block[1]) + "```\n"
                    );
                  });
                }

                /** Classes & Enums */
                if (entityType === 'Class' || entityType === 'Enum') {
                  entityType = entityType.toLowerCase(entityType);
                  tocData += (`\n1. [${classPath} ${entityType}](#${classPath.replace(/\s/g, "-")}-${entityType}) ${deprecated}`);
                  text = `\n---\n### ${classPath} ${entityType}${deprecated}`;

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
                  tocData += (`\n   * ${escapeAngleBrackets(entityName)}${deprecated}`);
                  text = `#### ${escapeAngleBrackets(text)}${deprecated}`;

                /** Parameters */
                } else if (entityType === "Param") {
                  if (firstParam) {
                    data += '\n##### Parameters:\n\n|Type|Name|Description|\n|:---|:---|:---|\n';
                    firstParam = false;
                  }
                  let pname = text.substr(0, text.indexOf(" "));
                  let descrip = text.substr(text.indexOf(" "));
                  text = `|${entityType}|${pname}${deprecated}|${descrip}|`;

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
                  let static = cdata[b].static ? "Yes" : " ";
                  descrip = descrip.replace(/\/\*\*/g, '');
                  text = `|${static}|${entitySubtype}|${text}|${descrip}${deprecated}|`;
                } else if (entityType === "Author") {
                  text = "";
                }
                data += `${text}\n`;
              })(cdataList);
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

    function matchAll(str, regexp, excludeComments) {
      let ret = [];
      let result = undefined;
      let i = 0;
      let nojavadocs = str.replace(REGEX_JAVADOC, ``).replace(/\/\/.*/g, ``);
      while (result = regexp.exec(str)) {
        if (nojavadocs.includes(result[0]) ||
          result[0].trim().substring(0,3) === `/**` ||
          !excludeComments
          ) {
          ret.push(result);
        } else {
          __DBG__(`Entity ${result[4]} commented out.`);
        }
      }
      return ret;
    }

    function filter(data) {
      let ret = [];
      data.forEach(function (target) {
        if (options.accessors.includes(target[1])) ret.push(target);
      });
      if (ret.length < data.length)
        __DBG__(`Filtered out ${data.length - ret.length} entities based on accessors.`);
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
        start: data.index,
        isDeprecated: (data[0].includes(`@Deprecated`)),
        isJavadocRequired: true
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
        start: data.index,
        isDeprecated: (data[0].includes(`@Deprecated`)),
        isJavadocRequired: true
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
        bodyx: undefined,
        line: getLineNumber(data),
        signature: (data[1] + " " + data[2] + " " + data[3] + " " + data[4]).replace(`  `, ` `) + " ",
        start: data.index,
        end: endIndex,
        path: ``,
        descrip: ``,
        level: undefined,
        isDeprecated: (data[0].includes(`@Deprecated`)),
        isJavadocRequired: (data[3] !== `enum` && (!data[5] || data[5].includes(`exception`)))
      };
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
          let isChild = cur.body.includes(target.signature);
          if (isChild) {
            level = recLevel(cur, classes, level + 1);
          } else {
            classes = classes.splice(classes.indexOf(target), 1);
          }
        }
      });
      return level;
    }

    function setClassBodyX(classes) {
      classes.forEach(function(target) {
        target.bodyx = target.body;
        classes.forEach(function(cur) {
          if (target !== cur) {
            let isChild = target.body.includes(cur.signature);
            if (isChild) {
              target.bodyx = target.bodyx.replace(cur.body, ``);
            }
          }
        });
      });
      return classes;
    }

    function setClassPaths(classes) {
      classes.forEach(function(cur) {
        cur.path = recPath(cur, cur.path, classes.slice(0)) + cur.toc;
      });
      return classes;
    }

    function recPath(target, path, classes) {
      classes.forEach(function(cur) {
        if (target !== cur) {
          let isChild = cur.body.includes(target.signature);
          if (isChild) {
            path += recPath(cur, cur.toc, classes) + ".";
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