# 课程内容与数据契约

## 1. 编辑目标

内容同时服务两种能力：

- 原子记忆：一个卡片解决一个清晰回忆任务；
- 案件表达：通过章节检查和串联卡把事实、证据、规则和复盘重新组合。

不得把 90 秒案件陈述机械切成无上下文短句，也不得用一张长答案卡冒充完整训练。

## 2. 推荐文件组织

```text
content/
├── manifest.json
├── courses/
│   ├── labor-arbitration.json
│   ├── return-property.json
│   ├── obtaining-loan-by-fraud.json
│   ├── cross-border-family.json
│   ├── post-divorce-property.json
│   ├── digital-assets.json
│   ├── trademark-transfer.json
│   ├── equity-design.json
│   ├── elder-care-fall.json
│   └── elder-care-choking.json
└── README.md
```

`manifest.json` 记录 `contentVersion`、课程列表和默认顺序。每门课程一个文件，便于测试和内容审阅。

## 3. 核心数据结构（逻辑契约）

实现可使用 TypeScript + Zod 等运行时校验，字段语义不得随意改变。

```ts
type CardLevel = 'core' | 'advanced' | 'link'
type CardKind =
  | 'qa'
  | 'cloze'
  | 'evidence-purpose'
  | 'comparison'
  | 'correction'
  | 'follow-up'
  | 'summary'

type Rating = 'again' | 'fuzzy' | 'good'

interface SourceRef {
  label: string
  path: string
  locator?: string
}

interface Card {
  id: string
  courseId: string
  chapterId: string
  level: CardLevel
  kind: CardKind
  prompt: string
  answer?: string
  answerPoints?: string[]
  followUps?: Array<{ prompt: string; answer: string }>
  checklist?: string[]
  redLine?: boolean
  tags: string[]
  sourceRefs: SourceRef[]
  estimatedSeconds: number
}
```

约束：

- `id` 全局唯一，建议使用可读稳定 ID，如 `labor.core.amounts.001`；发布后不复用。
- `courseId` 与 `chapterId` 必须存在于课程定义。
- 非 summary 卡至少提供 `answer` 或 `answerPoints`。
- summary 卡至少提供 3 个 `checklist`，并设置目标时间。
- follow-up 的追问不得脱离本案材料。
- sourceRefs 至少一项；locator 只在知道真实位置时填写，不编造页码。
- redLine 用于身份越界、结果混淆、证据造假等必须纠正的问题，不可滥用。

## 4. 课程与章节

每门课程均使用 SPEC 中的五个固定 chapterId，可附加课程说明、风险提示和推荐学习顺序。

课程必须至少包含：

- 核心事实与程序结果卡；
- 证据及证明目的卡；
- 李黎本人工作与团队边界卡；
- 法律争点卡；
- 至少一张复盘或比较卡；
- 至少一张 90 秒串联卡；
- 至少一组压力追问。

进阶卡不能替代上述核心覆盖。

## 5. 卡片编写规则

### 好卡

- 题面明确，能判断自己是否会答；
- 答案短而完整，保留必要因果；
- 一张卡只考一个主要记忆任务；
- 比较卡有清晰对照轴；
- 本人工作卡能落到真实动作和成果；
- 串联卡能检查完整口头表达。

### 需要重写

- “谈谈你对本案的理解”但没有评分点；
- 一张卡同时要求背五个无关事实；
- 答案只是“见原材料”；
- 把法律结论与事实主张混为一谈；
- 为凑数量把一句话拆成没有意义的多个空；
- 将预测题写成“考官必问”。

## 6. 示例

### 原子问答卡

```json
{
  "id": "labor.core.result.001",
  "courseId": "labor-arbitration",
  "chapterId": "case-map",
  "level": "core",
  "kind": "qa",
  "prompt": "员工请求的社保差额补偿是多少？",
  "answer": "147,492.60 元。",
  "tags": ["金额", "事实"],
  "sourceRefs": [
    {
      "label": "劳动争议案件简要",
      "path": "实习材料/网超/已打印/案件简要.pdf",
      "locator": "案情介绍"
    }
  ],
  "estimatedSeconds": 15
}
```

### 串联卡

```json
{
  "id": "return.link.summary.001",
  "courseId": "return-property",
  "chapterId": "interview-performance",
  "level": "link",
  "kind": "summary",
  "prompt": "用 90 秒说明返还原物案，并回答“登记在客户名下为何仍败诉”。",
  "checklist": [
    "说明一二审结果，不归咎法院",
    "讲清共同筹划、出资和共同生活",
    "区分登记权利与无权占有判断",
    "说出一项本人真实工作",
    "给出一条诉讼策略复盘"
  ],
  "tags": ["90秒", "压力追问"],
  "sourceRefs": [
    {
      "label": "返还原物案件简要",
      "path": "实习材料/陈银玲/返还原物纠纷/已打印/案件简要.pdf"
    }
  ],
  "estimatedSeconds": 90
}
```

示例用于说明结构，批量导入前仍需对照原件复核。

## 7. 内容验收

每次导入必须自动检查：

- JSON 和运行时 schema 合法；
- 卡片 ID 无重复；
- 课程、章节引用有效；
- 十门课程和五类章节完整；
- 答案、checklist、followUps 与题型匹配；
- sourceRefs 非空；
- 核心卡覆盖案件结果与本人工作；
- 不存在把未结案件写成已裁判的明显内容标记冲突；
- 内容版本变化不会意外重置旧进度。

内容测试应使用正式内容文件运行，而不是只测试手写示例。
