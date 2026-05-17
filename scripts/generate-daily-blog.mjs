import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const blogDir = path.resolve("src/content/blog");
const today = new Date().toISOString().slice(0, 10);
const apiKey = process.env.DEEPSEEK_API_KEY;

if (!apiKey) {
  console.error("DEEPSEEK_API_KEY is required.");
  process.exit(1);
}

const topics = [
  {
    slug: "huangguoshu-private-tour",
    title: "黄果树瀑布私家团怎么玩更省心？",
    category: "黄果树攻略",
    tags: ["黄果树", "私家团", "贵州旅行"],
  },
  {
    slug: "libo-xiaoqikong-family-tour",
    title: "荔波小七孔亲子游怎么安排更轻松？",
    category: "亲子旅行",
    tags: ["荔波小七孔", "亲子游", "贵州私家团"],
  },
  {
    slug: "xijiang-miao-village-night-view",
    title: "西江千户苗寨夜景住宿和拍照怎么选？",
    category: "摄影旅行",
    tags: ["西江千户苗寨", "夜景", "摄影"],
  },
  {
    slug: "guizhou-private-tour-planning",
    title: "第一次来贵州，私家团路线怎么规划不绕路？",
    category: "路线规划",
    tags: ["贵州私家团", "路线规划", "贵州旅游"],
  },
  {
    slug: "fanjingshan-weather-route",
    title: "梵净山行程怎么安排更稳妥？",
    category: "梵净山攻略",
    tags: ["梵净山", "贵州旅行", "行程安排"],
  },
  {
    slug: "guizhou-family-tour",
    title: "带老人孩子来贵州，哪些路线更适合慢游？",
    category: "家庭旅行",
    tags: ["老人游", "亲子游", "贵州定制游"],
  },
  {
    slug: "guizhou-car-and-driver",
    title: "贵州包车司导怎么选？外地游客要看哪些细节？",
    category: "包车司导",
    tags: ["包车司导", "贵州地接", "私家团"],
  },
];

function slugify(input) {
  return input
    .toLowerCase()
    .replace(/[^\p{Script=Han}a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function pickTopic(existingFiles) {
  const weekIndex = Math.floor(Date.now() / (86400000 * 7));
  for (let i = 0; i < topics.length; i += 1) {
    const topic = topics[(weekIndex + i) % topics.length];
    const base = `${today}-${topic.slug}`;
    if (!existingFiles.has(`${base}.mdx`)) return { topic, slug: base };
  }

  const topic = topics[weekIndex % topics.length];
  return { topic, slug: `${today}-${slugify(topic.title)}` };
}

function stripCodeFence(text) {
  return text.replace(/^```(?:md|markdown)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function excerpt(text, fallback) {
  const plain = text
    .replace(/^#+\s+/gm, "")
    .replace(/[*_>`#-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return (plain || fallback).slice(0, 110);
}

async function generate(topic) {
  const prompt = `请为贵州多彩美途旅行社的“贵州攻略”栏目写一篇中文旅游攻略文章。

文章标题：${topic.title}
文章主题：${topic.category}
关键词：${topic.tags.join("、")}

要求：
1. 输出 Markdown 正文，不要输出 YAML frontmatter，不要包裹代码块。
2. 面向外地游客，内容实用、自然、有真实旅行规划价值。
3. 字数约 1200-1800 中文字。
4. 至少包含 4 个二级标题。
5. 可以自然提到贵州多彩美途旅行社、私家团、包车司导、定制路线和联系电话 18984577004。
6. 不要虚构政府背书、平台认证、真实排行榜或不存在的统计数据。`;

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content: "你是贵州旅游攻略编辑，擅长写清晰、实用、可信的私家团出行建议。",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.75,
      stream: false,
    }),
  });

  if (!response.ok) {
    console.error(`DeepSeek API failed: ${response.status} ${await response.text()}`);
    process.exit(1);
  }

  const data = await response.json();
  const content = stripCodeFence(data.choices?.[0]?.message?.content || "");
  if (!content) {
    console.error("DeepSeek returned empty content.");
    process.exit(1);
  }
  return content;
}

mkdirSync(blogDir, { recursive: true });

const existingFiles = new Set(
  readdirSync(blogDir).filter((file) => file.toLowerCase().endsWith(".mdx")),
);
const { topic, slug } = pickTopic(existingFiles);
const filePath = path.join(blogDir, `${slug}.mdx`);

if (existsSync(filePath)) {
  console.log(`Skipped existing article: ${filePath}`);
  process.exit(0);
}

const content = await generate(topic);
const readTime = Math.max(5, Math.ceil(content.length / 900));
const description = excerpt(content, topic.title);

const frontmatter = `---
title: "${topic.title}"
cover: "/img/generated/xijiang-miao-village.webp"
date: "${today}"
category: "${topic.category}"
tags:
${topic.tags.map((tag) => `  - ${tag}`).join("\n")}
readTime: ${readTime}
description: "${description.replace(/"/g, '\\"')}"
author:
  name: "多彩美途"
  job: "贵州私家团顾问"
  avatar: "/img/optimized/avatar-none.webp"
---

`;

writeFileSync(filePath, frontmatter + content, "utf8");
console.log(`Created ${filePath}`);
