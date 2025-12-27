const mdItYamlFrontmatter = require("./frontmatter");

function activate() {
  return {
    extendMarkdownIt(md) {
      return md.use(mdItYamlFrontmatter, {
        allowAnywhere: true,
        startMarker: "---\n#yaml",
        startMarkerVertical: "---\n#yaml-v",
        endMarker: "---",
        name: "yaml-frontmatter",
        className: undefined,
        render: undefined,
        tableAttributeName: undefined,
        tableAttributeValue: undefined,
      });
    },
  };
}

module.exports = { activate };
