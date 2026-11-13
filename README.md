# 拾月 · Gather the Moon

一款在浏览器里玩的治愈系等距视错觉解谜小游戏。月亮碎成六瓣，落进六座沉睡的庭院；小兔团团提着灯，一瓣一瓣送回天上。

- 六章完整流程，约 15–25 分钟
- 零依赖、零素材文件：画面是手写 WebGL，音乐与音效全部由 WebAudio 实时生成
- 没有失败、没有计时、没有死局（由求解器证明，见下文）
- 约 1500 行原生 JavaScript，无构建步骤

## 怎么玩

起一个本地静态服务（已验证的方式）：

```bash
python3 -m http.server 8791
```

然后打开 `http://localhost:8791`。脚本都是普通 `<script>`，没有模块和网络请求，直接双击 `index.html` 预期也能玩，但这条路径尚未实测。

| 操作 | 效果 |
|---|---|
| 轻点石板 | 团团走过去（走不到会给一个收拢的小圈提示） |
| 拖动圆钮 / 握钮 | 转动桥、转臂、转轮，或升降石柱 |
| 轻点圆钮 | 转四分之一圈 |
| 按住石龟阿渡拖动 | 摆渡 |
| `R` / `M` | 重来本章 / 静音 |

地址后加 `?lv=3` 可直达第三章。进度存在浏览器 `localStorage`（键 `shiyue.v1`）。

## 六章

| 章 | 名 | 情绪 | 新玩法 | 调式与主奏 |
|---|---|---|---|---|
| 一 | 初醒 | 好奇 | 点击行走；水平转桥 | C 宫，筝 |
| 二 | 回廊 | 惊奇 | 视错觉连通；站在转臂上把自己「转过去」 | D 宫，筝 |
| 三 | 潮汐 | 安静 | 可骑乘的升降石柱；踏板让石路浮出水面 | A 羽，箫 |
| 四 | 相送 | 陪伴与告别 | 石龟阿渡摆渡；它停在莲台上，桥才升起，所以它不能跟你走 | F 宫，箫 |
| 五 | 霜夜 | 孤独与勇气 | 竖直转轮：同一根臂先当东桥、再当西桥，最后立起来成塔；升降柱送你去按高处的踏板，再落回去才对得上塔顶 | E 羽，磬 |
| 六 | 归月 | 团圆 | 前五章的机关全部回来：升降柱的中间层藏着升塔的踏板，转臂两端一头通踏板、一头通塔；最后一段月光阶梯直通满月 | G 宫，筝与箫 |

背景里的月亮就是进度条：每通一章，月相多一瓣。

## 实现要点

**不可能几何**（`js/logic.js`）。相机是固定的正交等距视角，视线方向为 (1,1,1)，所以两点相差 k·(1,1,1) 时落在同一个屏幕位置。每次机关落定后重建行走图：

- 同高相邻的砖自动连边；台阶按方向连上下两端。
- 标为「幻砖」的两块砖，若屏幕上相邻且不同高，则连一条视错觉边。
- 额外约束：靠 +x/+z 一侧的那块必须更高（更近相机）。这样近处砖面正好盖住远处砖的侧面，画面与真实相邻逐像素一致，不需要遮罩几何。
- 角色跨视错觉边时，全程待在更靠近相机的那一侧坐标系里，屏幕位置连续，深度不穿帮。
- 头顶被方块占住、或沉入水下的砖自动失效。

**渲染**（`js/gfx.js`）。一个着色器：按法线分三档明度并乘以关卡的冷暖色调，低处按世界高度淡出成雾；水面是带径向衰减的半透明平面。背景（天色、月相、水墨远山）和粒子、柔光各用一层 2D canvas。

**音频**（`js/audio.js`）。五声调式的生成式配乐：每章一条手写动机，随机移位、截短、留白；三角波长音垫底；卷积混响的脉冲响应由衰减噪声现场生成。所有交互音效的音高都取自当前章节的调式——脚步沿音阶走，转动机关每过 30° 拨一个音——所以怎么操作都不会走音。

**关卡数据**（`js/levels.js`）。纯数据，文件头有格式说明。布局守则：越高的结构越靠 -x/-z（屏幕上方），避免近处高物遮挡远处低物。

## 验证

```bash
node tools/solve.js
```

对每一关做完整状态空间搜索，检查四件事：可通关、无死局、无可走砖屏幕重叠、机关移动后主角脚下有效。当前结果 6/6 通过。改关卡后先跑它。

完整证据与未覆盖项见 [docs/verification/VERIFICATION_REPORT.md](docs/verification/VERIFICATION_REPORT.md)。其中音乐听感、真机触屏、Safari/Firefox 尚未验证。

## 设计参考

本作是同品类的原创作品，角色、关卡、美术、音乐均为原创，未使用任何第三方代码或素材。下面是动手前做的调研，标注了核验状态。

设计方法：

- 「每一屏都是可以挂上墙的画」；只有有新东西要说才加一关；面向不玩游戏的人。[Game Developer 访谈](https://www.gamedeveloper.com/design/designing-the-surprise-mobile-game-hit-i-monument-valley-i-)（已核验）
- 体验优先于难度，短而精。[GDC Vault 演讲摘要页](https://www.gdcvault.com/play/1020878/Designing-Monument-Valley-Less-Game)（已核验摘要，演讲全文未读）
- 固定相机，砍掉缩放与旋转，没有纯装饰元素。[Kill Screen](https://killscreen.com/monument-valley-elegance)（已核验）
- 转动机关时在设定角度触发单音，拖动即成音阶；混响量按场景尺度调。[A Sound Effect 访谈](https://www.asoundeffect.com/monument-valley-3-game-audio/)（已核验）
- 「无失败」「教学不靠文字」未找到开发者原话，待确认；本作这两点是自己的设计取舍。

技术实现：

- 原作团队自述错觉连接不能硬编码，需要实时导航标注；角色跨连接时是瞬移。具体算法未公开。[MCV](https://www.mcvuk.com/development/unity-focus-monument-valley)（已核验）
- 节点图加 BFS、错觉边按机关角度启停、沿视线轴移动在屏幕上不可见。[Kodeco 教程](https://www.kodeco.com/13582558-how-to-make-a-game-like-monument-valley)（已核验）

开源项目（只研究思路，未引入代码；license 取自各仓库本身）：

| 仓库 | License | 看了什么 |
|---|---|---|
| [mixandjam/MonumentValley-LevelDesign](https://github.com/mixandjam/MonumentValley-LevelDesign) | MIT | 手工配置路径，按机关角度启停边 |
| [snhwv/Monument-Valley](https://github.com/snhwv/Monument-Valley) | Unlicense | 把路径端点投影到相机平面、量化后自动建立视差连接 |
| [HypnosNova/MonumentValley](https://github.com/HypnosNova/MonumentValley) | GPL-2.0 | 邻接表加 BFS。GPL，只读不用 |
| [eliemichel/MonumentValley](https://github.com/eliemichel/MonumentValley) | 无 LICENSE | 触发器瞬移加位置偏移。无授权，只读不用 |

生成式音乐：多条不等长循环叠加、协和音集、卷积混响、留白。[Tero Parviainen, JavaScript Systems Music](https://teropa.info/blog/2016/07/28/javascript-systems-music.html)（已核验）

与这些做法的差异：本作的视错觉边是按规则自动推导的，不手工配置；并用「近侧必须更高」的约束代替遮罩几何。

## 目录

```
index.html            页面与样式
js/levels.js          六章关卡数据、色板、乐谱
js/logic.js           世界模型、连通图、寻路（浏览器与 Node 共用）
js/gfx.js             WebGL 渲染器与几何生成
js/audio.js           程序化配乐与音效
js/game.js            主循环、建模、交互、演出、界面
tools/solve.js        关卡求解器
docs/verification/    验证报告与证据
```

## License

Apache-2.0，见 [LICENSE](LICENSE)。
