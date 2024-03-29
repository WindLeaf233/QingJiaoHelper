import { exec } from "child_process";
// import * as fs from "fs";
import {
  readdirSync,
  statSync,
  readFileSync,
  existsSync,
  rmSync,
  writeFileSync,
} from "fs";

const srcDirectory = "./src";
const distFile = "./dist.ts";
const distFileJS = "./dist.js";
const metadataFile = "./metadata.json";
const menuHTMLFile = "./menu.html";

type metadata = {
  name: string;
  namespace: string;
  version: string;
  description: string;
  author: string;
  match: string[];
  grant: string[];
  license: string;
  supportURL: string;
  require: string[];
  resource: { [key: string]: string };
};

/**
 * 处理传入的文件内容
 * @param content 文件内容
 * @returns 修剪过的文件内容
 */
function handleFileContent(content: string): string {
  const resultContent: string[] = [];
  let importsEnd = false;
  for (let line of content.split(/\r?\n/)) {
    // 把 unicode 文本转换为 utf-8 文本
    line = unicodeToText(line);

    // 跳过 `import` 段
    if (line === "/// imports end") {
      importsEnd = true;
      continue;
    }

    if (importsEnd) {
      // 删除每一行的 `export`
      line = line.replace("export ", "");
      // 删除注释
      const pure = line.trim();
      if (
        !pure.startsWith("/*") &&
        !pure.startsWith("*") &&
        !pure.startsWith("//")
      ) {
        resultContent.push(line);
      }
    }
  }
  return resultContent.join("\n");
}

/**
 * 将 unicode 文本转换为普通文本
 * @param text 带有 unicode 的文本
 * @returns 普通文本
 */
function unicodeToText(text: string) {
  return text.replace(/\\u[\dA-F]{4}/gi, (match) => {
    return String.fromCharCode(parseInt(match.replace(/\\u/g, ""), 16));
  });
}

/**
 * 获取指定文件目录下所有文件的路径（包括子目录）
 * @param directoryPath 要获取的文件目录的相对或绝对路径
 */
function getAllFilePaths(directoryPath: string): string[] {
  const result: string[] = [];
  const files = readdirSync(directoryPath);
  for (const filePath of files) {
    const path = `${directoryPath}/${filePath}`;
    const stats = statSync(path);
    if (stats.isDirectory()) {
      result.push(...getAllFilePaths(path));
    } else {
      result.push(path);
    }
  }
  return result;
}

/**
 * 根据 `./src` 目录下的所有文件（不包括 `.d.ts`），将内容整合进一个文件中
 */
(function () {
  let resultFileContent: string[] = [];

  // 解析元信息
  const metadataContent = readFileSync(metadataFile, "utf-8");
  const metadata: metadata = JSON.parse(metadataContent);
  const metadataLines: string[] = [];
  metadataLines.push("// ==UserScript==");

  // 获取最长长度，以便对齐
  let maxLength = 0;
  for (const key in metadata) {
    const value = metadata[key];
    if (value instanceof Object) {
      for (const iKey in value) {
        const realKey = `${key} ${iKey}`;
        const length = realKey.length;
        maxLength = Math.max(maxLength, length);
      }
    } else {
      const length = key.length;
      maxLength = Math.max(maxLength, length);
    }
  }

  for (const key in metadata) {
    const value = metadata[key];

    if (value instanceof Array) {
      const spaces = Array(maxLength - key.length)
        .fill(" ")
        .join("");
      for (const content of value) {
        metadataLines.push(`// @${key}${spaces} ${content}`);
      }
    } else if (value instanceof Object) {
      for (const iKey in value) {
        const spaces = Array(maxLength - `${key} ${iKey}`.length)
          .fill(" ")
          .join("");
        const content = value[iKey];
        metadataLines.push(`// @${key} ${iKey}${spaces} ${content}`);
      }
    } else {
      const spaces = Array(maxLength - key.length)
        .fill(" ")
        .join("");
      metadataLines.push(`// @${key}${spaces} ${value}`);
    }
  }
  metadataLines.push("// ==/UserScript==");

  // 添加元信息到文件
  resultFileContent.push(...metadataLines);

  // 遍历 `./src` 目录下的所有文件
  const files = getAllFilePaths(srcDirectory);
  for (const filePath of files) {
    // 跳过 `.d.ts`
    if (!filePath.endsWith(".d.ts")) {
      const content = readFileSync(filePath, "utf-8");
      if (content !== undefined) {
        const resultContent = handleFileContent(content);
        resultFileContent.push(resultContent);
      }
    }
  }

  // 添加菜单 HTML 解析
  const menuHTML = readFileSync(menuHTMLFile);
  resultFileContent.push(`const container = document.createElement("div");`);
  resultFileContent.push(`container.setAttribute("id", "qjh-menu");`);
  resultFileContent.push("container.innerHTML = `" + menuHTML + "`;");
  resultFileContent.push(`container.style.display = "none";`);
  resultFileContent.push("document.body.appendChild(container); ");
  resultFileContent.push("function showMenu() {");
  resultFileContent.push(`  container.style.display = "unset";`);
  resultFileContent.push("}");

  // 生成文件
  [distFile, distFileJS].forEach((path) => {
    if (existsSync(path)) {
      rmSync(path);
    }
  });

  const result = resultFileContent.join("\n");
  writeFileSync(distFile, result, "utf-8");

  // 执行编译
  exec(`tsc ${distFile} --noEmitHelpers --target ES2017`, (_, stdout) => {
    for (const line of stdout.split("\n")) {
      if (line.lastIndexOf("Cannot find name") === -1) {
        console.log(line);
      }
    }

    // tsc 编译后又会变成 unicode
    // 因此需要两次转 utf-8
    const content = readFileSync(distFileJS, "utf-8");
    writeFileSync(distFileJS, unicodeToText(content), "utf-8");
  });
})();
