# 王旭东个人学术主页维护说明

基于现有 Academic Pages / Jekyll 项目改造。导航为主页、方向介绍、出版物、团队，采用中文正文和必要的英文专业术语。本次仅修改本地项目，未推送或发布。

## 内容入口

| 内容 | 文件 |
| --- | --- |
| 个人简介、教学、招生、联系方式 | `_pages/about.md` |
| 三个研究方向与 Machine learning / AI 展望 | `_pages/research.html` |
| 论文列表与五篇代表作简介 | `_data/publications.json` |
| 著作 | `_pages/publications.html` |
| 团队成员与毕业去向 | `_data/team.yml` |
| 导航、全站配置 | `_data/navigation.yml`、`_config.yml` |
| 配色、排版、移动端样式 | `assets/css/academic.css` |
| 本地研究示意图 | `assets/images/academic/` |

团队所有成员均为明确标注的示例。将 `_data/team.yml` 中的姓名与信息替换为真实信息后，再修改该文件的 `notice` 及 `_pages/team.html` 的“成员信息示例”标题。主页按用户提供的 Word 整理；邮箱取自已发表论文的公开通讯信息。两个学校参考网站本次抓取遇到防护，保留其链接，未据此补写未经验证的履历，也未使用模板头像。

研究方向根据 ORCID 论文提炼，AI 部分是研究展望。所有 SVG 是概念示意，不是实验或论文结果。

## ORCID 实时更新与回退

论文目录唯一来源为 `0000-0001-7987-2685` 的 ORCID 公开记录。初始收录 31 篇 `journal-article`，按 ORCID 发表日期从新到旧排序。本地引用的卷期、页码及乱码标题通过对应 DOI 的 Crossref 元数据补全。

打开出版物页面时先显示完整静态列表，随后请求 ORCID 公共 API 的目录与批量详情（每批最多 100 篇）。只有所有数据通过校验才整体替换列表；总等待时间上限 12 秒。接口失败、超时或返回不完整时保留本地内容。禁用 JavaScript 也能阅读全部本地论文。无登录、无密钥、无后端、无浏览器持久存储，编译时不联网读取论文。

五篇代表作对应 **2026-10-16 降序列表的第 1、3、5、6、8 篇**，通过 DOI 保留简介，新增论文不改变选择。实时新增论文使用 ORCID 提供的作者、标题、期刊、年份与 DOI；卷期页码可通过下述维护命令补齐。未公开在 ORCID 的论文不会自动补入。

若希望更新无 JavaScript 和网络故障时显示的本地版本，在项目根目录运行：

```sh
python scripts/sync_orcid.py --enrich
```

仅使用 Python 标准库；`--enrich` 补充 Crossref 引用元数据。省略该参数会保留现有补充数据。脚本保持已选代表作简介，数据抓取失败时不覆盖已有文件。更新后提交 `_data/publications.json` 即可。普通的实时更新不需要运行此命令或重新部署。

## 编译与检查

推荐 Ruby 3.3 及 Bundler，在项目根目录执行：

```sh
bundle install
bundle exec jekyll build --strict_front_matter
python scripts/verify_site.py
node --test tests/orcid-publications.test.cjs
bundle exec jekyll serve
```

本地浏览 `http://127.0.0.1:4000/`。GitHub Pages 部署沿用 `.github/workflows/jekyll.yml`，推送 `master` 时执行严格 front matter 编译。GitHub 仓库的 Pages 来源需选择 GitHub Actions。

若只想查看本次已生成的 `_site/`，无需配置 Ruby，可运行 `python -m http.server 4000 --bind 127.0.0.1 --directory _site`，然后访问同一地址。

原主题的示例页面和示例文章保留在源码中，但通过 `_config.yml` 排除，不生成至公开网站。`local/`、`vendor/`、`.bundle/`、`_site/` 均为忽略目录，不应上传。

本机验证使用项目内临时 JRuby 环境、Jekyll 4.4.1 及符合 Gemfile 约束的兼容依赖，执行了 production 严格编译。使用独立 CSS 的四个页面不再编译主题原有的 Sass 样式。当前工具未提供可用浏览器，因此未做浏览器中的目视验收；已检查生成 HTML、本地链接、图片资源和实时更新的成功及失败行为。


## 修改后推送
每次修改后，先ctrl+s保存修改内容，然后在终端执行

cd C:\Users\CLJ\NPhardmath.github.io
git status
git add .
git commit -m "更新网站内容"
git push origin master

最后在源代码管理页面点击...，并选择推送。
打开仓库 Actions 页面，查看 Deploy academic homepage to Pages。最新一次运行显示绿色勾后，访问网站内容即可