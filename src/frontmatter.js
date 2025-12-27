"use strict";

const jsYaml = require("js-yaml");
const yamlLoad = jsYaml.load || jsYaml.safeLoad;

module.exports = function markdownItYamlFrontmatter(md, options = {}) {
  const config = {
    name: "yaml-frontmatter",
    startMarker: "---\n#yaml",
    startMarkerVertical: "---\n#yaml-v",
    endMarker: "---",
    allowAnywhere: true,
    className: undefined,
    tableAttributeName: undefined,
    tableAttributeValue: undefined,
    render: null,
    ...options,
  };

  const { name, startMarker, endMarker } = config;

  const getLine = (state, line) =>
    state.src.slice(
      state.bMarks[line] + state.tShift[line],
      state.eMarks[line]
    );

  const checkLine = (state, line, marker) => {
    const markerLines = marker.split("\n");
    return markerLines.every((markerLine, i) => {
      const text = getLine(state, line + i).replace(/\r$/, "");
      return text.trim() === markerLine.trim();
    });
  };

  const isStartMarker = (state, line) => checkLine(state, line, startMarker);
  const isStartMarkerVertical = (state, line) =>
    checkLine(state, line, config.startMarkerVertical);
  const isEndMarker = (state, line) => checkLine(state, line, endMarker);

  const findEndOfBlock = (state, startLine, endLine) => {
    for (let line = startLine + 1; line < endLine; line++) {
      if (isEndMarker(state, line)) return line;
    }
    return false;
  };

  const parseYaml = (state, startOfBlock, endOfBlock) => {
    const content = state.getLines
      ? state.getLines(
          startOfBlock,
          endOfBlock + 1,
          state.tShift[startOfBlock],
          false
        )
      : state.src.slice(
          state.bMarks[startOfBlock] + state.tShift[startOfBlock],
          state.eMarks[endOfBlock] + 1
        );
    return yamlLoad(content);
  };

  const createToken = (state, type, tag, nesting, map) => {
    const token = state.push(type, tag, nesting);
    token.map = map;
    return token;
  };

  const addTableAttributes = (token) => {
    if (config.className) {
      token.attrPush(["class", config.className]);
    }
    if (config.tableAttributeName) {
      token.attrPush([config.tableAttributeName, config.tableAttributeValue]);
    }
  };

  const isArray = (value) => Array.isArray(value);

  const isObjectArray = (value) => {
    return (
      isArray(value) &&
      value.length > 0 &&
      value.every(
        (item) =>
          typeof item === "object" && item !== null && !Array.isArray(item)
      )
    );
  };

  const isPrimitiveArray = (value) => {
    return (
      isArray(value) &&
      value.length > 0 &&
      value.every((item) => typeof item !== "object" || item === null)
    );
  };

  const createNestedTable = (state, data, map) => {
    if (isPrimitiveArray(data)) {
      createToken(state, `${name}_nested_open`, "table", 1, map);
      createToken(state, `${name}_tbody_open`, "tbody", 1, map);
      createToken(state, `${name}_tr_open`, "tr", 1, map);

      data.forEach((item) => {
        createToken(state, `${name}_td_open`, "td", 1, map);
        const inline = state.push("inline", "", 0);
        inline.content = String(item);
        inline.map = map;
        inline.children = [];
        createToken(state, `${name}_td_close`, "td", -1, null);
      });

      createToken(state, `${name}_tr_close`, "tr", -1, null);
      createToken(state, `${name}_tbody_close`, "tbody", -1, null);
      createToken(state, `${name}_nested_close`, "table", -1, null);
    } else if (isObjectArray(data)) {
      const keys = Object.keys(data[0]);
      createToken(state, `${name}_nested_open`, "table", 1, map);

      createToken(state, `${name}_thead_open`, "thead", 1, map);
      createToken(state, `${name}_tr_open`, "tr", 1, map);
      keys.forEach((key) => {
        createToken(state, `${name}_th_open`, "th", 1, map);
        const inline = state.push("inline", "", 0);
        inline.content = key;
        inline.map = map;
        inline.children = [];
        createToken(state, `${name}_th_close`, "th", -1, null);
      });
      createToken(state, `${name}_tr_close`, "tr", -1, null);
      createToken(state, `${name}_thead_close`, "thead", -1, null);

      createToken(state, `${name}_tbody_open`, "tbody", 1, map);
      data.forEach((row) => {
        createToken(state, `${name}_tr_open`, "tr", 1, map);
        keys.forEach((key) => {
          createToken(state, `${name}_td_open`, "td", 1, map);
          if (isArray(row[key])) {
            createNestedTable(state, row[key], map);
          } else {
            const inline = state.push("inline", "", 0);
            inline.content = String(row[key]);
            inline.map = map;
            inline.children = [];
          }
          createToken(state, `${name}_td_close`, "td", -1, null);
        });
        createToken(state, `${name}_tr_close`, "tr", -1, null);
      });
      createToken(state, `${name}_tbody_close`, "tbody", -1, null);
      createToken(state, `${name}_nested_close`, "table", -1, null);
    }
  };

  const createCell = (state, cellType, content, map) => {
    createToken(state, `${name}_${cellType}_open`, cellType, 1, map);

    if (isArray(content)) {
      createNestedTable(state, content, map);
    } else {
      const inline = state.push("inline", "", 0);
      inline.content = content;
      inline.map = map;
      inline.children = [];
    }

    createToken(state, `${name}_${cellType}_close`, cellType, -1, null);
  };

  const createRow = (state, keys, data, cellType, map) => {
    createToken(state, `${name}_tr_open`, "tr", 1, map);
    keys.forEach((key) => {
      const value = data[key];
      const content = isArray(value) ? value : String(value);
      createCell(state, cellType, content, map);
    });
    createToken(state, `${name}_tr_close`, "tr", -1, null);
  };

  const pushTokensToState = (
    state,
    blockStartLine,
    blockEndLine,
    frontmatterContents,
    vertical = false
  ) => {
    const oldParent = state.parentType;
    const oldLineMax = state.lineMax;
    const keys = Object.keys(frontmatterContents);
    const map = [blockStartLine, blockEndLine];

    state.parentType = name;
    state.lineMax = blockEndLine;

    const tableToken = createToken(state, `${name}_open`, "table", 1, map);
    tableToken.markup = vertical ? config.startMarkerVertical : startMarker;
    tableToken.block = true;
    addTableAttributes(tableToken);

    if (vertical) {
      createToken(state, `${name}_tbody_open`, "tbody", 1, map);
      keys.forEach((key) => {
        createToken(state, `${name}_tr_open`, "tr", 1, map);
        createCell(state, "th", key, map);
        createCell(state, "td", frontmatterContents[key], map);
        createToken(state, `${name}_tr_close`, "tr", -1, null);
      });
      createToken(state, `${name}_tbody_close`, "tbody", -1, null);
    } else {
      createToken(state, `${name}_thead_open`, "thead", 1, map);
      createRow(
        state,
        keys,
        Object.fromEntries(keys.map((k) => [k, k])),
        "th",
        map
      );
      createToken(state, `${name}_thead_close`, "thead", -1, null);

      createToken(state, `${name}_tbody_open`, "tbody", 1, map);
      createRow(state, keys, frontmatterContents, "td", map);
      createToken(state, `${name}_tbody_close`, "tbody", -1, null);
    }

    const closeToken = createToken(state, `${name}_close`, "table", -1, null);
    closeToken.markup = endMarker;
    closeToken.block = true;

    state.parentType = oldParent;
    state.lineMax = oldLineMax;
    state.line = blockEndLine + 1;

    return true;
  };

  const parseFrontmatter = (state, startLine, endLine, silent) => {
    if (!config.allowAnywhere && (startLine !== 0 || state.blkIndent > 0))
      return false;

    const vertical = isStartMarkerVertical(state, startLine);
    if (!isStartMarker(state, startLine) && !vertical) return false;
    if (silent) return true;

    const blockEndLine = findEndOfBlock(state, startLine, endLine);
    if (blockEndLine === false) return false;

    let frontmatterContents;
    try {
      frontmatterContents = parseYaml(state, startLine + 1, blockEndLine - 1);
    } catch (e) {
      return false;
    }

    const isEmptyObject =
      !frontmatterContents ||
      (typeof frontmatterContents === "object" &&
        !Array.isArray(frontmatterContents) &&
        Object.keys(frontmatterContents).length === 0);

    if (isEmptyObject) return false;

    return pushTokensToState(
      state,
      startLine,
      blockEndLine,
      frontmatterContents,
      vertical
    );
  };

  const renderDefault = (tokens, idx, _options, env, self) => {
    if (tokens[idx].type === `${name}_open`) {
      addTableAttributes(tokens[idx]);
    }
    if (tokens[idx].type === `${name}_nested_open`) return "<table>";
    if (tokens[idx].type === `${name}_nested_close`) return "</table>";
    return self.renderToken(tokens, idx, _options, env, self);
  };

  const render = config.render || renderDefault;

  md.block.ruler.before("fence", name, parseFrontmatter, {
    alt: ["paragraph", "reference", "blockquote", "list"],
  });

  const renderRules = [
    "_open",
    "_close",
    "_thead_open",
    "_thead_close",
    "_tbody_open",
    "_tbody_close",
    "_tr_open",
    "_tr_close",
    "_th_open",
    "_th_close",
    "_td_open",
    "_td_close",
    "_nested_open",
    "_nested_close",
  ];

  renderRules.forEach((rule) => {
    md.renderer.rules[name + rule] = render;
  });
};
