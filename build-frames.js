const fs = require("fs");
const path = require("path");

const root = __dirname;
const sourceDir = path.join(root, "Frame");
const outputDir = path.join(root, "assets", "frames");
const framesJsonPath = path.join(root, "frames.json");
const framesJsPath = path.join(root, "frames.js");

function readOptional(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "").trim();
  } catch (error) {
    return "";
  }
}

function primaryFileIn(folderPath, files) {
  return files.find((file) => /_1\.svg$/i.test(file)) || files.find((file) => /\.svg$/i.test(file) && !/_2\.svg$/i.test(file));
}

function badgeFileIn(files) {
  return files.find((file) => /_2\.svg$/i.test(file));
}

function outlineFileIn(files) {
  return (
    files.find((file) => /_3\.svg$/i.test(file)) ||
    files.find((file) => /_2[-_]outline\.svg$/i.test(file)) ||
    files.find((file) => /_outline\.svg$/i.test(file))
  );
}

function sealBadge(svg) {
  const style =
    "<style>path, polygon, rect, circle, ellipse {" +
    " stroke: #fff; stroke-width: 2; paint-order: stroke fill;" +
    " stroke-linejoin: round; stroke-linecap: round; }</style>";
  return svg.replace(/(<svg\b[^>]*>)/i, "$1" + style);
}

function svgSize(svg) {
  const width = svg.match(/\bwidth="([0-9.]+)"/i);
  const height = svg.match(/\bheight="([0-9.]+)"/i);
  if (width && height) {
    return { width: parseFloat(width[1]), height: parseFloat(height[1]) };
  }
  const viewBox = svg.match(/viewBox="([^"]+)"/i);
  if (viewBox) {
    const parts = viewBox[1].trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4) return { width: parts[2], height: parts[3] };
  }
  return null;
}

function normalizeSvg(svg) {
  if (/preserveAspectRatio\s*=/i.test(svg)) {
    return svg.replace(/preserveAspectRatio\s*=\s*"[^"]*"/i, 'preserveAspectRatio="none"');
  }
  return svg.replace(/<svg\b/i, '<svg preserveAspectRatio="none"');
}

function main() {
  if (!fs.existsSync(sourceDir)) {
    console.error("Frame folder not found: " + sourceDir);
    process.exit(1);
  }

  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });

  const folders = fs
    .readdirSync(sourceDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const frames = [];
  const version = Date.now().toString(36);

  for (const folder of folders) {
    const folderPath = path.join(sourceDir, folder);
    const files = fs.readdirSync(folderPath, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);

    const primaryName = primaryFileIn(folderPath, files);
    if (!primaryName) {
      console.warn("skip " + folder + ": no primary SVG");
      continue;
    }

    const primarySource = fs.readFileSync(path.join(folderPath, primaryName), "utf8");
    const primaryRelative = "assets/frames/" + folder + "/primary.svg?v=" + version;
    const outputFolder = path.join(outputDir, folder);
    fs.mkdirSync(outputFolder, { recursive: true });
    fs.writeFileSync(path.join(outputFolder, "primary.svg"), normalizeSvg(primarySource), "utf8");

    const outlineName = outlineFileIn(files);

    const badgeName = badgeFileIn(files);
    let badgeRelative = null;
    let badgeSize = null;
    if (badgeName) {
      badgeRelative = "assets/frames/" + folder + "/badge.svg?v=" + version;
      const badgeSource = fs.readFileSync(path.join(folderPath, badgeName), "utf8");
      badgeSize = svgSize(badgeSource);
      const badgeOutput = outlineName ? sealBadge(badgeSource) : badgeSource;
      fs.writeFileSync(path.join(outputFolder, "badge.svg"), badgeOutput, "utf8");
    }

    let outlineRelative = null;
    let outlineSize = null;
    if (outlineName) {
      outlineRelative = "assets/frames/" + folder + "/outline.svg?v=" + version;
      const outlineSource = fs.readFileSync(path.join(folderPath, outlineName), "utf8");
      fs.writeFileSync(path.join(outputFolder, "outline.svg"), outlineSource, "utf8");
      outlineSize = svgSize(outlineSource);
    }

    const label = readOptional(path.join(folderPath, "label.txt")) || "Frame " + folder;

    frames.push({
      id: folder,
      label: label,
      primary: primaryRelative,
      badge: badgeRelative,
      badgeWidth: badgeSize ? badgeSize.width : null,
      badgeHeight: badgeSize ? badgeSize.height : null,
      outline: outlineRelative,
      outlineWidth: outlineSize ? outlineSize.width : null,
      outlineHeight: outlineSize ? outlineSize.height : null
    });
  }

  const json = JSON.stringify(frames, null, 2) + "\n";
  fs.writeFileSync(framesJsonPath, json, "utf8");
  fs.writeFileSync(framesJsPath, "window.FRAMES = " + json + ";\n", "utf8");

  const indexPath = path.join(root, "index.html");
  if (fs.existsSync(indexPath)) {
    let html = fs.readFileSync(indexPath, "utf8");
    ["frames.js", "link.js", "reel.js"].forEach(function (file) {
      const pattern = new RegExp(
        '(<script src="' + file.replace(/\./g, "\\.") + ')(\\?v=[^"]*)?("><\\/script>)'
      );
      html = html.replace(pattern, "$1?v=" + version + "$3");
    });
    fs.writeFileSync(indexPath, html, "utf8");
  }

  console.log("Built " + frames.length + " frame(s):");
  frames.forEach((frame, index) => {
    console.log("  " + (index + 1) + ". " + frame.id + " — " + frame.label + (frame.badge ? " + badge" : "") + (frame.link ? " + link" : ""));
  });
  console.log("Wrote frames.js, frames.json and assets/frames.");
}

main();
