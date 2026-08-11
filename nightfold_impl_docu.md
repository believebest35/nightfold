# Nightfold / 夜叠

> An endless drive through a folded neon city.

本文档是 Nightfold 的产品定义、技术规格和实施计划。主要施工者是 DeepSeek V4 Pro / Flash；人类开发者负责运行、试玩、确认视觉效果和提交代码；高级规划模型负责拆解任务、审查架构与疑难问题。

DeepSeek 在开始任何任务前，都必须先阅读本文档。除非任务明确要求修改规划，否则不得擅自扩大项目范围、替换技术栈或一次实现多个阶段。

---

## 1. 项目一句话定义

Nightfold 是一个运行在现代浏览器中的伪 3D 夜间驾驶体验：玩家沿着程序化生成的山城道路不断前进，穿过弯道、坡路、高架、隧道与雨夜霓虹。

它强调氛围、速度感和不断变化的城市景观，不追求真实赛车模拟。

---

## 2. 核心体验

玩家打开页面后，应当能在数秒内进入驾驶状态：

- 道路持续向远方延伸，具有弯道和上下坡。
- 玩家能控制左右转向、加速和刹车。
- 夜空、雾、灯光、建筑轮廓和道路反光共同形成山城夜景。
- 沿途景观具有层叠、垂直、拥挤的城市感，而不是平坦的普通公路。
- 即使没有目标、分数或终点，单纯驾驶也应当令人愿意持续几分钟。

三个体验支柱：

1. **流动感**：画面持续向玩家靠近，速度变化清晰可感。
2. **层叠感**：道路、建筑、高架和远景在不同高度重叠。
3. **夜雨氛围**：克制的霓虹、雾、车灯和湿润路面构成统一视觉风格。

---

## 3. 明确不做什么

在 MVP 和第一轮视觉打磨完成前，禁止实现以下内容：

- 不使用 Three.js、WebGL、Unity、Godot 或其他游戏引擎。
- 不实现真实刚体、轮胎、悬挂或车辆动力学。
- 不实现多人联机、账号、排行榜和云存档。
- 不实现开放世界、自由下车或任意方向探索。
- 不接入后端服务或数据库。
- 不引入 React、Vue 等 UI 框架。
- 不使用需要授权的商业素材。
- 不生成复杂 3D 模型。
- 不优先支持手机触屏。
- 不在 MVP 阶段制作关卡编辑器。

如果某项需求可能把项目变成完整赛车游戏，应先停下来更新规划，而不是直接实现。

---

## 4. 目标平台与技术栈

### 4.1 目标平台

- 开发环境：macOS 或 Linux。
- 运行环境：支持 Canvas 2D 和 ES2022 的现代桌面浏览器。
- 首要浏览器：Chrome、Edge、Safari。
- 首要设备：MacBook M1 Pro。
- 输入方式：键盘。
- 页面应支持窗口缩放和全屏。

### 4.2 固定技术栈

- Node.js 20 LTS 或更高版本
- npm
- Vite
- TypeScript，开启严格模式
- HTML5 Canvas 2D
- Vitest：只测试纯逻辑，不测试像素画面
- ESLint + Prettier

除非确有必要，不增加运行时依赖。首个可玩版本的运行时依赖应当为零。

### 4.3 预期命令

```bash
npm install
npm run dev
npm run build
npm run preview
npm run typecheck
npm run lint
npm run test
```

`npm run build`、`npm run typecheck`、`npm run lint` 和 `npm run test` 必须作为每个阶段的基本检查。

---

## 5. 视觉方向

### 5.1 风格

第一版采用简洁、可控的矢量/low-poly 风格，不追求写实：

- 深蓝黑夜空
- 暖白或琥珀色路灯
- 青色、洋红色作为少量霓虹点缀
- 湿润的深灰道路
- 建筑以大块暗色轮廓为主，只显示少量窗灯
- 雾用于隐藏远处细节并制造空间层次
- UI 尽量克制，不遮挡驾驶画面

### 5.2 推荐初始色板

色值集中定义在 `src/config/palette.ts`，渲染模块不得到处硬编码颜色。

```ts
export const palette = {
  skyTop: "#050711",
  skyBottom: "#12182a",
  fog: "#202840",
  road: "#171a22",
  roadAlt: "#1c202a",
  lane: "#d8d2b8",
  guardrail: "#596273",
  buildingNear: "#111521",
  buildingFar: "#161b2b",
  windowWarm: "#f0b85a",
  neonCyan: "#42d9e8",
  neonMagenta: "#df4caa",
  tailLight: "#ff304f",
  headLight: "#fff1c4",
} as const;
```

颜色后续可以调整，但必须保持集中管理。

### 5.3 视觉验收原则

- “像一个有明确风格的游戏”比“技术效果很多”更重要。
- 霓虹只能作为点缀，禁止把所有物体都画成高饱和发光色。
- 远景细节少、对比低；近景细节多、对比高。
- 使用雾和遮挡形成深度，而不是无限堆叠对象。
- 首版允许复古感和几何感，不以照片写实作为验收标准。

---

## 6. 游戏规则与初始参数

所有可调参数集中放在 `src/config/game-config.ts`，不要散落 magic number。

建议初始值：

```ts
export const gameConfig = {
  targetFps: 60,
  fixedTimeStep: 1 / 60,
  segmentLength: 200,
  roadHalfWidth: 1000,
  rumbleLength: 3,
  drawDistance: 240,
  cameraHeight: 900,
  cameraFovDegrees: 90,
  playerZ: 1000,
  maxSpeed: 12000,
  acceleration: 6000,
  braking: 10000,
  naturalDeceleration: 2500,
  offRoadDeceleration: 7000,
  steeringRate: 2.2,
  centrifugalForce: 0.32,
  fogDensity: 4.5,
  maxDevicePixelRatio: 2,
  worldSeed: 20260728,
} as const;
```

这些数值只是起点。DeepSeek 不得为了“感觉可能更好”一次修改大量参数。每次调参应注明目的，并尽量只改变一个维度。

基础规则：

- `ArrowUp` / `W`：加速
- `ArrowDown` / `S`：刹车
- `ArrowLeft` / `A`：左转
- `ArrowRight` / `D`：右转
- `P` / `Escape`：暂停
- `R`：复位到道路中央
- `F`：切换全屏
- 失去窗口焦点时自动暂停或清空输入状态，防止按键卡住。

首版可以没有碰撞。车辆驶出道路后，通过降低速度和增强画面震动提供反馈。

---

## 7. 技术原理：伪 3D 道路

### 7.1 基本模型

世界由一系列首尾相连的道路段 `RoadSegment` 构成。每个道路段具有：

- 世界空间中的起点与终点 `z`
- 高度 `y`
- 曲率 `curve`
- 道路样式
- 左右两侧的景观对象

相机只沿道路前进。渲染时，把相机前方若干道路段投影到屏幕坐标，再从远到近绘制道路四边形。

道路不是 3D 网格。它由一系列投影后的梯形组成：

```text
远端：较窄、位置较高
近端：较宽、位置较低
```

弯道通过逐段累积横向偏移实现；坡度通过相邻道路段的世界高度差实现。

### 7.2 透视投影

投影代码应封装为纯函数，放在 `src/render/projection.ts`。

核心概念：

```ts
scale = cameraDepth / relativeZ;
screenX = screenCenterX + scale * relativeX * screenWidth * 0.5;
screenY = screenCenterY - scale * relativeY * screenHeight * 0.5;
screenW = scale * roadHalfWidth * screenWidth * 0.5;
```

其中：

- `relativeX = worldX - cameraX`
- `relativeY = worldY - cameraY`
- `relativeZ = worldZ - cameraZ`
- `cameraDepth = 1 / tan(fov / 2)`

实现时必须处理 `relativeZ <= nearClip`，禁止出现 `NaN`、`Infinity` 或负宽度。

### 7.3 弯道

绘制从近到远的道路段时，维护两个累积量：

- `x`：当前道路中心相对于相机的偏移
- `dx`：偏移变化速度

每经过一个道路段：

```ts
x += dx;
dx += segment.curve;
```

渲染时将 `x` 加入该道路段的相机横向偏移。玩家自身还具有归一化横向位置 `playerX`，大致范围为 `[-2, 2]`，道路边缘约为 `-1` 和 `1`。

不要在多个渲染文件中重复弯道计算。世界查询和投影逻辑必须只有一个权威实现。

### 7.4 坡度

每个道路段记录起点和终点高度。相机高度基于玩家所在道路段进行插值：

```ts
cameraY = interpolatedRoadY + cameraHeight;
```

道路生成器应使用平滑过渡构造坡度，避免相邻道路段高度突变。

### 7.5 循环世界

MVP 使用循环道路：

- 预生成固定数量的道路段。
- 相机位置超过总道路长度后取模。
- 查询前方道路段时正确处理数组末尾到开头的循环。
- 场景对象绑定到道路段，不应因为循环而丢失。

后续可以改为按块生成无限道路，但不是 MVP 的要求。

---

## 8. 推荐目录结构

```text
nightfold/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── eslint.config.js
├── README.md
├── NIGHTFOLD_IMPLEMENTATION_PLAN.md
├── public/
│   └── favicon.svg
├── src/
│   ├── main.ts
│   ├── style.css
│   ├── config/
│   │   ├── game-config.ts
│   │   └── palette.ts
│   ├── core/
│   │   ├── game.ts
│   │   ├── game-loop.ts
│   │   ├── input.ts
│   │   └── resize.ts
│   ├── model/
│   │   ├── types.ts
│   │   └── game-state.ts
│   ├── world/
│   │   ├── road-builder.ts
│   │   ├── road-generator.ts
│   │   ├── road-query.ts
│   │   ├── scenery-generator.ts
│   │   └── seeded-random.ts
│   ├── render/
│   │   ├── renderer.ts
│   │   ├── projection.ts
│   │   ├── sky-renderer.ts
│   │   ├── road-renderer.ts
│   │   ├── scenery-renderer.ts
│   │   ├── weather-renderer.ts
│   │   ├── vehicle-renderer.ts
│   │   └── hud-renderer.ts
│   └── test/
│       ├── projection.test.ts
│       ├── road-generator.test.ts
│       └── seeded-random.test.ts
└── .github/
    └── workflows/
        └── ci.yml
```

目录可以随着实际实现微调，但必须维持以下边界：

- `world/` 负责生成和查询世界，不直接绘制。
- `render/` 只根据输入状态绘制，不改变游戏状态。
- `core/` 负责生命周期、循环、输入和窗口。
- `model/` 存放共享数据结构。
- `config/` 存放集中参数和视觉常量。

禁止建立一个包含全部逻辑的巨型 `game.ts`。

---

## 9. 核心数据结构

以下接口是建议的初始契约。实现中可以补充字段，但不要随意改变语义。

```ts
export interface WorldPoint {
  worldX: number;
  worldY: number;
  worldZ: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
  halfWidth: number;
  scale: number;
  clipY: number;
}

export interface RoadPoint {
  world: WorldPoint;
  screen?: ScreenPoint;
}

export type RoadZone =
  | "city"
  | "elevated"
  | "tunnel"
  | "riverside";

export interface RoadSegment {
  index: number;
  p1: RoadPoint;
  p2: RoadPoint;
  curve: number;
  zone: RoadZone;
  colorVariant: 0 | 1;
  scenery: SceneryObject[];
}

export type SceneryKind =
  | "building"
  | "streetlight"
  | "guardrail"
  | "sign"
  | "tunnel-frame";

export interface SceneryObject {
  id: string;
  kind: SceneryKind;
  segmentIndex: number;
  side: "left" | "right";
  offset: number;
  width: number;
  height: number;
  colorVariant: number;
}

export interface InputState {
  accelerate: boolean;
  brake: boolean;
  steerLeft: boolean;
  steerRight: boolean;
}

export interface GameState {
  positionZ: number;
  speed: number;
  playerX: number;
  distanceTravelled: number;
  paused: boolean;
  elapsedSeconds: number;
}

export interface RenderContext {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  dpr: number;
}
```

原则：

- TypeScript 不得使用无解释的 `any`。
- 世界数据与屏幕投影数据要区分。
- 渲染代码不得修改 `GameState`。
- 随机生成必须可通过 seed 复现。
- 对象 ID 必须稳定，不能每帧重新生成。

---

## 10. 游戏循环与渲染管线

### 10.1 游戏循环

使用 `requestAnimationFrame`，逻辑更新采用固定时间步长：

1. 计算真实帧间隔，并限制最大值，避免后台切回时巨幅跳跃。
2. 把时间累积到 accumulator。
3. 当 accumulator 大于固定步长时调用 `update(fixedDelta)`。
4. 调用 `render(interpolationAlpha)`。

建议限制单帧最多执行 5 次逻辑更新，避免“死亡螺旋”。

### 10.2 更新顺序

```text
读取输入
→ 更新速度
→ 更新 playerX
→ 应用弯道离心偏移
→ 应用越界减速
→ 更新 positionZ
→ 处理道路循环
→ 更新表现层状态
```

### 10.3 绘制顺序

每帧清空画布后，严格按以下顺序：

1. 天空渐变
2. 远山与远处城市剪影
3. 远景雾层
4. 道路，从远到近
5. 与道路绑定的建筑、路灯和护栏
6. 雨、薄雾、速度线等屏幕空间效果
7. 玩家车辆或车头轮廓
8. HUD 和暂停层

道路必须从远到近绘制，以保证近处道路覆盖远处道路。坡顶后方被遮挡的道路段应通过 `clipY` 裁剪，避免穿透前景。

---

## 11. 程序化道路生成

### 11.1 确定性随机数

实现一个简单、可测试的 seed 随机数生成器。相同 seed 必须生成完全相同的道路和景观。

禁止在世界生成代码中直接调用 `Math.random()`。

### 11.2 RoadBuilder API

建议提供：

```ts
class RoadBuilder {
  addStraight(length: number): this;
  addCurve(
    enter: number,
    hold: number,
    leave: number,
    curve: number,
  ): this;
  addHill(
    enter: number,
    hold: number,
    leave: number,
    height: number,
  ): this;
  addSCurves(): this;
  build(): RoadSegment[];
}
```

`enter / hold / leave` 表示渐入、保持和渐出道路段数量。曲率与高度变化必须使用 ease-in/ease-out，而不是瞬间变化。

### 11.3 MVP 道路配方

首个循环建议由以下片段组成：

1. 短直道，用于玩家进入状态。
2. 缓慢右弯并轻微上坡。
3. 一段起伏的 S 弯。
4. 较长左弯。
5. 高架直道。
6. 下坡进入短隧道。
7. 沿江缓弯。
8. 回到起点高度和方向趋势。

循环连接处必须满足：

- 高度没有明显跳变。
- 曲率没有明显跳变。
- 道路样式切换合理。

---

## 12. 山城景观系统

景观不是随机撒满屏幕，而是根据道路区域 `RoadZone` 生成。

### 12.1 City

- 两侧密集建筑。
- 建筑高度变化明显。
- 少量竖向招牌和窗灯。
- 近处建筑颜色更深，对比更强。

### 12.2 Elevated

- 道路护栏明显。
- 建筑位于更低的视觉层。
- 可见远处层叠道路的剪影，但 MVP 不要求它们可驾驶。
- 路灯间距规律。

### 12.3 Tunnel

- 周期性隧道框架。
- 顶部和两侧形成暗色遮罩。
- 暖色灯光重复向玩家靠近。
- 进入与离开隧道应有渐变，禁止一帧内全屏变黑或变亮。

### 12.4 Riverside

- 一侧建筑较少，出现暗色江面。
- 江面反射采用简化竖向光带，不做真实反射。
- 远处可以有桥或城市剪影。

### 12.5 景观生成约束

- 使用 seed 决定尺寸、颜色变体和是否生成。
- 每个道路段限制景观对象数量。
- 同类对象至少准备 3 种比例或轮廓变体。
- 大型地标低频出现，小型路灯和护栏规律出现。
- 渲染器根据投影尺寸自动跳过过小对象。

---

## 13. 性能预算

目标是在 M1 Pro 的桌面浏览器中，以 1440p 左右窗口尺寸稳定接近 60 FPS。

约束：

- `devicePixelRatio` 最高按 2 处理。
- 默认绘制距离不超过 240 个道路段。
- 避免每帧创建大量临时数组、对象和闭包。
- 避免在每个对象上反复调用 `save()` / `restore()`。
- 渐变对象可按窗口尺寸缓存，窗口变化时重建。
- 只绘制相机前方且投影后尺寸足够的景观。
- 雨滴等粒子使用固定池或固定长度数组。
- 不在游戏循环内打印 console 日志。
- 不在每帧读取 DOM 布局属性。

优化顺序：

1. 先用浏览器 Performance 工具确定瓶颈。
2. 减少绘制对象数量。
3. 减少状态切换与分配。
4. 缓存可复用结果。
5. 最后才考虑更复杂的预渲染。

禁止在没有测量结果时进行大规模“性能重构”。

---

## 14. 阶段实施计划

每个阶段必须单独完成、验收和提交。DeepSeek 一次只能执行当前明确指定的阶段或任务。

### Phase 0：工程骨架

目标：得到一个结构清晰、检查命令齐全的空项目。

任务：

- 初始化 Vite + TypeScript。
- 配置 strict TypeScript、ESLint、Prettier、Vitest。
- 建立本文档规定的基础目录。
- 创建全屏 Canvas，正确处理窗口尺寸和 DPR。
- 实现空的固定步长游戏循环。
- 显示临时 FPS/窗口尺寸调试文字。
- 添加基础 CI：安装、typecheck、lint、test、build。
- 编写 README 的安装和运行方式。

验收标准：

- `npm install && npm run dev` 可以启动。
- 调整窗口大小时画布清晰且无拉伸。
- Safari 与 Chrome 至少都能显示深色背景。
- 所有检查命令通过。
- 此时不应出现道路、车辆或复杂视觉效果。

建议执行者：V4 Pro。

### Phase 1：第一条可见道路

目标：自动镜头沿一条具备透视感的道路持续前进。

任务：

- 定义道路段和投影类型。
- 实现投影纯函数及单元测试。
- 实现固定数量的直线路段。
- 从远到近绘制草地/城市底色、路肩、道路和车道线。
- 让相机以固定速度前进并循环。
- 实现坡顶遮挡所需的 `clipY`。
- 添加调试开关，可显示道路段编号和投影点。

验收标准：

- 道路近宽远窄，前进方向稳定。
- 经过数组循环点时画面不闪烁、不跳跃。
- 不出现空白帧、NaN 或无限宽梯形。
- 调整窗口大小后投影仍正确。
- 投影和循环查询拥有单元测试。

建议执行者：V4 Pro。

### Phase 2：弯道、坡度与驾驶

目标：玩家可以在有弯道和坡度的循环道路上驾驶。

任务：

- 实现 `RoadBuilder`。
- 加入平滑弯道、S 弯和山坡。
- 实现键盘输入状态。
- 实现速度、加速、刹车和自然减速。
- 实现左右转向。
- 实现弯道离心偏移。
- 实现驶出道路后的减速和轻微视觉反馈。
- 实现暂停、复位、失焦清空输入。
- HUD 显示速度和暂停状态。

验收标准：

- 松开方向键后车辆不继续错误转向。
- 弯道与坡度没有突然折断。
- 玩家可以驶出路面，但速度明显下降。
- 高低帧率下游戏速度基本一致。
- 浏览器切到后台再切回时位置不会瞬移。

建议执行者：V4 Pro；HUD 微调可交给 Flash。

### Phase 3：基础夜景

目标：从技术演示变成具有 Nightfold 身份的夜间驾驶画面。

任务：

- 实现夜空渐变、远山和远处城市剪影。
- 实现距离雾。
- 道路增加交替色块、护栏、路灯。
- 实现基础建筑生成和绘制。
- 建筑增加少量确定性窗灯。
- 加入玩家车尾或车头的简化视觉锚点。
- 将所有颜色迁移到 palette。

验收标准：

- 截一张静态图时能明确看出是夜间城市道路。
- 建筑不会遮住道路主体。
- 远近层次清晰。
- 路灯不会因循环点突然大面积消失。
- 霓虹比例克制，没有全屏高饱和。

建议执行者：V4 Pro 搭建；Flash 负责色板与尺寸的局部迭代。

### Phase 4：山城区域

目标：形成区别于普通公路游戏的垂直山城特征。

任务：

- 为道路段加入 `RoadZone`。
- 实现 city、elevated、tunnel、riverside 四类区域。
- 添加高架护栏和低处建筑层。
- 添加隧道框架与进出渐变。
- 添加简化江面和竖向反射。
- 添加少量远处高架或桥梁剪影。
- 调整道路配方，使区域转换与弯坡组合自然。

验收标准：

- 不看 HUD，也能从至少三个路段截图中分辨不同区域。
- 隧道进出无亮度突变。
- 江面反射不会覆盖道路。
- 高架区域呈现明显的垂直落差。
- 完整循环驾驶时不存在严重视觉断层。

建议执行者：逐个区域交给 V4 Pro，每个区域单独提交。

### Phase 5：雨夜与速度感

目标：增强驾驶氛围，但不破坏画面可读性。

任务：

- 实现固定数量的屏幕空间雨滴。
- 雨滴速度随车速轻微变化。
- 增加道路湿润高光或简化反射。
- 增加高速时的轻微相机抖动和速度线。
- 增加刹车、越界和高速的差异化反馈。
- 加入可调节的天气强度。

验收标准：

- 静止或低速时雨滴不会造成强烈速度错觉。
- 高速比低速明显更有冲击感。
- 雨滴不会导致帧率显著下降。
- 道路边界和车道线仍然清晰。
- 屏幕抖动幅度小，不引起不适。

建议执行者：Flash 可做独立效果；V4 Pro 负责整合和性能检查。

### Phase 6：产品化与发布

目标：形成可以分享给他人打开试玩的网页。

任务：

- 添加标题页、开始、暂停和重新开始。
- 添加画质选项：Low / Medium / High。
- 添加静音占位开关；若没有音频，不显示无效设置。
- 保存少量本地设置到 `localStorage`。
- 添加键位说明。
- 添加全屏按钮。
- 改善加载失败和 Canvas 不支持时的提示。
- 完善 README、截图和 GitHub Pages 部署。

验收标准：

- 新用户不看源码也知道如何开始和控制。
- 刷新后画质等设置能够恢复。
- GitHub Pages 打开即用，无后端依赖。
- Chrome 与 Safari 完成一次人工试玩。
- 所有自动检查通过。

建议执行者：V4 Pro 负责状态设计；Flash 负责 UI 细节和文案。

---

## 15. 每个任务的标准工作协议

DeepSeek 收到任务后，必须按以下顺序工作：

1. 阅读 `NIGHTFOLD_IMPLEMENTATION_PLAN.md`。
2. 查看当前仓库结构、`git status` 和相关文件。
3. 用 5～10 条简短要点复述：
   - 当前阶段
   - 本次目标
   - 预计修改文件
   - 明确不会修改的范围
4. 如果任务与当前架构冲突，先解释冲突，不要直接重写。
5. 实现最小完整改动。
6. 运行：

   ```bash
   npm run typecheck
   npm run lint
   npm run test
   npm run build
   ```

7. 汇报：
   - 修改了什么
   - 为什么这样设计
   - 自动检查结果
   - 需要人类肉眼验证什么
   - 已知限制
8. 除非用户明确要求，不自动提交、不推送、不创建 PR。

如果检查失败，必须报告真实失败，禁止用删除测试、关闭 strict、添加 `any` 或跳过 lint 的方式掩盖问题。

---

## 16. DeepSeek 编码约束

### 必须遵守

- 一次只完成一个任务。
- 修改前先阅读相关代码。
- 优先小范围补丁，不做无关重构。
- 每个文件保持单一职责。
- 纯计算逻辑尽量写成纯函数。
- 公共接口使用明确 TypeScript 类型。
- 所有随机世界内容使用 seeded random。
- 所有游戏参数集中管理。
- 每次修改保持项目可运行。
- 注释解释“为什么”，不要逐行翻译代码。

### 禁止事项

- 禁止在没有批准时更换技术栈。
- 禁止引入重量级依赖来解决简单问题。
- 禁止把多个模块合并到一个大文件。
- 禁止复制两份相似投影或道路查询逻辑。
- 禁止在逻辑层直接操作 DOM。
- 禁止在渲染器中修改世界和游戏状态。
- 禁止使用 `// @ts-ignore` 掩盖普通类型错误。
- 禁止为了通过测试而降低断言质量。
- 禁止删除用户已有但与当前任务无关的代码。
- 禁止在一次视觉调优中同时大改色板、几何和速度参数。

### 复杂度警戒线

出现以下任一情况时，先停下来汇报：

- 单个源码文件超过约 400 行。
- 单个函数超过约 60 行且承担多项职责。
- 新增一个运行时依赖。
- 需要修改超过 8 个源码文件才能完成一个小功能。
- 需要改变核心坐标系或 RoadSegment 数据结构。
- 出现持续性帧率问题但没有性能测量。

这些不是绝对限制，但必须说明理由。

---

## 17. 测试策略

### 17.1 自动测试

重点测试纯逻辑：

- seeded random 的可复现性。
- 相同 seed 生成相同道路。
- 道路段 `z` 连续递增。
- 循环道路查询在数组边界正确。
- 投影函数对合法输入返回有限数值。
- 近处投影宽度大于远处投影宽度。
- 道路生成后曲率和高度过渡没有超出设定阈值。
- 速度始终限制在 `[0, maxSpeed]`。
- 暂停时逻辑位置不更新。

不做脆弱的 Canvas 像素快照测试。

### 17.2 人工视觉检查

每个视觉任务完成后至少检查：

- 1280×720
- 1440×900 或类似 MacBook 窗口
- 2560×1440
- DPR 1 和 DPR 2
- 窗口运行时缩放
- Chrome
- Safari

每次人工验收至少驾驶 2 分钟，观察：

- 道路循环点
- 长弯道
- 上坡与下坡
- 区域切换
- 驶出道路
- 暂停与恢复
- 切换浏览器标签页

### 17.3 回归原则

修复视觉 bug 时，应尽可能构造纯逻辑回归测试。如果只能肉眼判断，则在任务汇报中写明重现路径和修复后的检查方法。

---

## 18. Git 与提交规范

推荐分支：

```text
main
feature/phase-1-road
feature/tunnel-zone
fix/road-loop-flicker
polish/rain-visibility
```

推荐提交格式：

```text
feat: add pseudo-3d road projection
feat: add deterministic road generator
fix: prevent flicker at road loop boundary
refactor: isolate scenery rendering
test: cover seeded road generation
docs: update phase 2 acceptance notes
```

一次提交只表达一个逻辑变化。视觉参数调整可以单独提交，便于对比和回退。

禁止把以下内容提交到仓库：

- `node_modules/`
- 构建产物 `dist/`
- 本地编辑器缓存
- 临时截图和性能 trace
- API key、token 或个人路径

---

## 19. 模型分工

### DeepSeek V4 Pro 适合

- 新阶段的整体实现
- 核心数据结构
- 投影、道路生成和游戏循环
- 跨模块重构
- 难以定位的状态或性能问题
- 完整 code review 后的修复

### DeepSeek V4 Flash 适合

- 修改少量颜色、尺寸和参数
- 增加一个简单景观变体
- README 和界面文案
- 单个纯函数的测试补充
- 明确边界的小 bug
- ESLint、格式和简单类型问题

### 不要交给 Flash 独立完成

- 坐标系调整
- 道路投影重写
- 游戏循环重构
- 多模块状态设计
- 性能瓶颈分析
- 一次跨越多个 Phase 的任务

---

## 20. 可直接复制给 DeepSeek 的提示词

### 20.1 新任务通用模板

```text
你正在开发 Nightfold。先完整阅读仓库根目录的
NIGHTFOLD_IMPLEMENTATION_PLAN.md，再检查当前代码和 git status。

本次只执行：
【在这里填写一个具体任务】

要求：
1. 先用简短要点复述当前阶段、本次目标、预计修改文件和非目标。
2. 不扩大范围，不提前实现后续 Phase。
3. 遵守文档中的模块边界、TypeScript 约束和性能约束。
4. 优先做最小完整修改，保留现有行为。
5. 完成后运行 typecheck、lint、test、build。
6. 最后列出修改摘要、检查结果、人工验收步骤和已知限制。
7. 不自动 commit，不 push，不创建 PR。

如果任务描述与规划或现有代码冲突，先停下来说明，不要自行猜测。
```

### 20.2 Phase 0 首次施工提示词

```text
你正在从空目录创建 Nightfold 项目。先阅读
NIGHTFOLD_IMPLEMENTATION_PLAN.md。

本次只完成 Phase 0：工程骨架。

请使用 Vite + strict TypeScript + Canvas 2D + Vitest + ESLint + Prettier。
建立规划文档中建议的模块目录，但不要为了占位创建大量无内容文件。
实现全窗口 Canvas、DPR 处理、resize 和固定时间步长的空游戏循环。
画面只需要深色背景和临时调试文字，不实现道路、车辆、建筑或天气。
补充 README 和 GitHub Actions CI。

开始修改前，先给出文件计划。完成后运行：
npm run typecheck
npm run lint
npm run test
npm run build

最后汇报所有新增文件、设计决定、检查结果和人工验证方法。
不要自动 commit 或 push。
```

### 20.3 让 DeepSeek 自查的提示词

```text
请对当前未提交改动进行严格 code review，不要立即修改。

先阅读 NIGHTFOLD_IMPLEMENTATION_PLAN.md，然后查看 git diff。
重点检查：
- 是否超出当前任务范围
- world、render、core、model 的职责是否混淆
- 是否存在重复的投影或道路查询逻辑
- 是否存在 any、ts-ignore、magic number 或 Math.random
- 游戏循环是否与帧率独立
- 循环道路边界是否可能闪烁
- resize / DPR 是否正确
- 是否有不必要的每帧分配
- 测试是否覆盖关键纯逻辑

按严重程度输出 Blocking、Important、Minor 三类问题。
每个问题提供文件、相关函数、原因和最小修复建议。
如果没有某类问题，明确写“无”。
本次不要修改文件。
```

### 20.4 交给 Flash 的小任务模板

```text
先阅读 NIGHTFOLD_IMPLEMENTATION_PLAN.md 和相关源码。

本次是一个严格限定的小修改：
【填写修改】

允许修改的文件：
【列出 1～3 个文件】

禁止：
- 修改核心数据结构
- 新增依赖
- 重构其他模块
- 调整无关参数

完成后运行与改动相关的检查，并提供精确的人工验证步骤。
不要自动 commit 或 push。
```

### 20.5 Bug 修复模板

```text
先阅读 NIGHTFOLD_IMPLEMENTATION_PLAN.md，不要立即修改。

Bug：
【现象】

复现步骤：
【步骤】

预期行为：
【预期】

请先定位根因并说明：
1. 状态从哪里产生
2. 经过哪些函数
3. 为什么最终表现错误
4. 最小修复点在哪里

得到确认后再实现修复。修复时尽量增加纯逻辑回归测试，
并运行 typecheck、lint、test、build。不要顺手重构无关代码。
```

---

## 21. 当前进度清单

维护者应在每个阶段完成后更新此处。

- [x] Phase 0：工程骨架
- [x] Phase 1：第一条可见道路
- [x] Phase 2：弯道、坡度与驾驶
- [x] Phase 3：基础夜景
- [x] Phase 4：山城区域
- [x] Phase 5：雨夜与速度感
- [x] Phase 6：产品化与发布

当前阶段：`Phase 6`（已完成：产品化入口、设置、帮助、错误提示与 Pages 工作流已接入）

当前下一步：维护与发布；GitHub Pages 工作流会在推送 `main` 后执行。

---

## 22. MVP 完成定义

满足以下全部条件时，Nightfold 的 MVP 才算完成：

- 浏览器中可直接开始驾驶。
- 道路包含直道、弯道和上下坡。
- 具备加速、刹车、转向、暂停和复位。
- 具有稳定循环，不在边界闪烁。
- 至少包含 city、elevated、tunnel、riverside 四类区域。
- 具有统一的夜景、雾、建筑、路灯和基础雨效。
- 1440p 左右在 M1 Pro 上基本保持流畅。
- Chrome 和 Safari 均可运行。
- 不需要后端、账号或外部服务。
- typecheck、lint、test、build 全部通过。
- README 足以让新用户安装、启动和操作。
- 能通过静态截图和短视频体现 Nightfold 的独特风格。

MVP 之后再讨论音效、音乐、交通车辆、照片模式、每日 seed、游戏手柄和更复杂的城市事件。

---

## 23. 最重要的开发原则

Nightfold 的目标不是证明能够实现多少系统，而是持续产出一个愿意打开、愿意观看、愿意驾驶几分钟的数字玩具。

遇到取舍时，按以下优先级决定：

```text
可运行
> 可驾驶
> 有氛围
> 有山城辨识度
> 内容丰富
> 技术复杂
```

任何让代码明显复杂、但无法让玩家直接看到或感受到的功能，都应推迟。
