<template>
  <section class="ai-skills">
    <header class="skills-header">
      <div><h1>AI 技能</h1><p>将本地 Demo 分析能力接入你常用的 AI 客户端。</p></div>
    </header>

    <article class="skills-card install-card">
      <div class="card-heading"><span class="card-index">01</span><div><h2>安装技能</h2><p>让本地 AI 读取已解析的对局数据。</p></div></div>
      <ol class="install-steps">
        <li>从 <a :href="repo + '/tree/main/skills/cs2-sandbox-grenades'" target="_blank" rel="noreferrer">GitHub 仓库下载技能目录</a>。</li>
        <li>将 <code>skills/cs2-sandbox-grenades</code> 整个文件夹放入 AI 客户端的技能目录，然后重新加载技能。</li>
        <li>保持 cs2-sandbox 运行。在下方选择对局并复制提示词给本地 AI。</li>
      </ol>
      <div class="install-helper">
        <div class="helper-heading"><strong>让本地 AI 帮你安装</strong><button class="ds-btn" @click="copyInstallation">{{ installationCopied ? '已复制' : '复制' }}</button></div>
        <p>{{ installPrompt }}</p>
      </div>
      <p v-if="installationCopyError" class="form-error" role="alert">{{ installationCopyError }}</p>
      <p class="form-note">本地 AI 需要支持技能，并能运行 Python 3 或调用 HTTP 工具。连接只在当前沙盒会话有效，重启后请重新复制提示词。</p>
    </article>

    <div class="section-heading"><span class="card-index">02</span><div><h2>选择技能</h2><p>当前提供一项道具分析能力。</p></div></div>
    <button class="skill-card" :class="{ selected: enabled }" @click="enabled = !enabled" :aria-expanded="enabled">
      <span class="skill-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4"/><circle cx="12" cy="12" r="4"/></svg></span>
      <span class="skill-copy"><strong>道具总结</strong><small>按落点汇总多场对局的烟、闪、火、雷</small></span><span class="skill-toggle">{{ enabled ? '收起' : '配置' }}</span>
    </button>

    <article v-if="enabled" class="skills-card config-card">
      <div class="card-heading compact"><div><h2>选择对局 <span>{{ selected.length }} 场</span></h2><p>相同地图、阵营和道具类型分别统计；每场对局会扫描全部已解析回合。</p></div></div>
      <p v-if="!readyDemos.length" class="empty">还没有可分析的对局。请先到 Demo 库解析 .dem 文件。</p>
      <template v-else>
        <div class="selection-tools"><input v-model="search" placeholder="搜索文件名或地图" aria-label="搜索对局"/><button class="ds-btn" @click="selectVisible">选择当前结果</button><button class="ds-btn" @click="selected = []">清空</button></div>
        <div class="matches ds-scrollbar">
          <label v-for="demo in filteredDemos" :key="demo.id" class="match" :class="{ checked: selected.includes(String(demo.id)) }">
            <input type="checkbox" v-model="selected" :value="String(demo.id)" :disabled="selected.length >= 50 && !selected.includes(String(demo.id))"/>
            <span><strong>{{ demo.fileName }}</strong><small>{{ demo.mapName }} · {{ demo.totalRounds }} 回合</small></span>
          </label><p v-if="!filteredDemos.length" class="empty">没有匹配的对局</p>
        </div>
      </template>
      <div class="options">
        <label>分析阵营<select v-model="side"><option value="T">T 方</option><option value="CT">CT 方</option><option value="both">T 和 CT 分别分析</option></select></label>
        <label>水平落点容差<input type="number" v-model.number="radius" min="16" max="512" step="1"/><small>16–512 游戏单位</small></label>
        <label>高度容差<input type="number" v-model.number="height" min="16" max="256" step="1"/><small>16–256，区分上下层</small></label>
      </div>
      <p class="form-note">落点以最密集的实际位置为中心归组，避免相邻点位连锁合并。默认水平 120、高度 80；旧缓存需要重新解析，才能按换边后的阵营统计。</p>
      <div class="prompt-heading"><div><h2>分析提示词</h2><p>复制后交给已经安装技能的本地 AI。</p></div><button class="ds-btn ds-btn-primary" :disabled="!valid" @click="copyPrompt">{{ copied ? '已复制' : '复制提示词' }}</button></div>
      <textarea readonly :value="valid ? prompt : '选择至少一场对局，并填写有效容差后生成提示词。'" aria-label="生成的分析提示词" rows="12" />
      <p v-if="copyError" class="form-error" role="alert">{{ copyError }}</p>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ReplayData } from '@/types/replay';
import { localConnectionURL } from './api';
const props = defineProps<{ demos: ReplayData[] }>();
const repo = 'https://github.com/bugkingZHT/cs-demobox';
const installPrompt = '请从 https://github.com/bugkingZHT/cs-demobox 获取 skills/cs2-sandbox-grenades 整个目录，按当前 AI 客户端的技能安装方式安装，保留 SKILL.md、scripts 和 references。确认可以运行 Python 3 或调用本地 HTTP API，然后告诉我如何启用该技能。';
const enabled = ref(false), selected = ref<string[]>([]), search = ref('');
const side = ref('T'), radius = ref(120), height = ref(80), copied = ref(false), copyError = ref('');
const installationCopied = ref(false), installationCopyError = ref('');
const readyDemos = computed(() => props.demos.filter(d => d.status === 1 && d.id));
const filteredDemos = computed(() => readyDemos.value.filter(d => `${d.fileName} ${d.mapName}`.toLowerCase().includes(search.value.toLowerCase())));
watch(readyDemos, demos => { selected.value = selected.value.filter(id => demos.some(d => String(d.id) === id)); });
function selectVisible() { selected.value = [...new Set([...selected.value, ...filteredDemos.value.map(d => String(d.id))])].slice(0, 50); }
const valid = computed(() => selected.value.length > 0 && selected.value.length <= 50 && Number.isFinite(radius.value) && radius.value >= 16 && radius.value <= 512 && Number.isFinite(height.value) && height.value >= 16 && height.value <= 256);
const prompt = computed(() => `使用 cs2-sandbox-grenades 技能，通过本地 HTTP 工具分析以下对局。
连接地址：${localConnectionURL()}
请求参数：${JSON.stringify({ demoIds: selected.value, side: side.value, radius: radius.value, heightTolerance: height.value })}
对局名称（仅供识别）：${JSON.stringify(readyDemos.value.filter(d => selected.value.includes(String(d.id))).map(d => d.fileName))}

汇总选中对局的全部回合、所有玩家的实际投掷。按地图、投掷时 T/CT 阵营和烟、闪、火、雷分别统计落点聚合 Top 10，燃烧瓶与燃烧弹合并为火。
请调用技能附带脚本或 HTTP 工具取得真实结果，不要凭印象生成数字。按地图和投掷时 T/CT 阵营分别输出一张聚合表，将烟、闪、火、雷放在同一张表中。表格只保留四列：道具类型、投掷次数、相关回合数、代表投掷。代表投掷必须是直接打开出手时刻道具解析的学习链接。
每类道具按投掷次数降序列出 Top 10；不足十组如实返回。不要输出落点坐标、排名、玩家覆盖数或其它表格列。披露估计落点与缺失数据；频次不代表道具效果，不要臆造地图点位名称。如果提示旧缓存缺少阵营，请告知需要重新解析。`);
watch(prompt, () => { copied.value = false; copyError.value = ''; });
async function copyInstallation() { try { await navigator.clipboard.writeText(installPrompt); installationCopied.value = true; installationCopyError.value = ''; } catch { installationCopyError.value = '复制失败，请手动选中并复制安装提示。'; } }
async function copyPrompt() { try { await navigator.clipboard.writeText(prompt.value); copied.value = true; copyError.value = ''; } catch { copyError.value = '复制失败，请选中上方提示词手动复制。'; } }
</script>

<style scoped>
.ai-skills { width: 100%; max-width: 1120px; margin: 0 auto; padding: 28px var(--ds-space-xl) 56px; color: var(--ds-text-primary); }
.skills-header { display: flex; align-items: end; min-height: 60px; padding: 0 0 var(--ds-space-lg); margin-bottom: var(--ds-space-xl); border-bottom: 1px solid var(--ds-border-default); } h1 { margin: 0 0 6px; font-size: var(--ds-text-2xl); line-height: 1.2; letter-spacing: -0.3px; } h2 { margin: 0; font-size: var(--ds-text-lg); line-height: 1.35; } p { margin: 0; } .skills-header p, .card-heading p, .section-heading p, .prompt-heading p, .form-note { color: var(--ds-text-tertiary); font-size: var(--ds-text-sm); line-height: 1.65; }
.skills-card { border: 1px solid var(--ds-border-default); border-radius: var(--ds-radius-md); background: var(--ds-bg-secondary); box-shadow: var(--ds-shadow-sm); }.install-card, .config-card { padding: var(--ds-space-xl); margin-bottom: var(--ds-space-2xl); }.card-heading, .section-heading { display: flex; align-items: flex-start; gap: var(--ds-space-md); }.card-heading.compact { margin-bottom: var(--ds-space-lg); }.card-index { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; flex: 0 0 28px; color: var(--ds-text-secondary); background: var(--ds-surface-active); border-radius: var(--ds-radius-sm); font-family: var(--ds-font-mono); font-size: var(--ds-text-xs); font-weight: 700; }
.install-steps { margin: var(--ds-space-xl) 0; padding-left: 20px; color: var(--ds-text-secondary); font-size: var(--ds-text-sm); line-height: 1.9; } a { color: var(--ds-primary); } code { padding: 2px 5px; border: 1px solid var(--ds-border-default); border-radius: 4px; background: var(--ds-bg-primary); color: var(--ds-text-secondary); font-family: var(--ds-font-mono); font-size: 12px; }.install-helper { padding: var(--ds-space-lg); border: 1px solid var(--ds-border-subtle); border-radius: var(--ds-radius-md); background: var(--ds-bg-primary); }.helper-heading { display: flex; align-items: center; justify-content: space-between; gap: var(--ds-space-md); margin-bottom: var(--ds-space-md); font-size: var(--ds-text-sm); }.install-helper p { color: var(--ds-text-secondary); font-size: var(--ds-text-sm); line-height: 1.75; user-select: text; overflow-wrap: anywhere; }.form-note { margin-top: var(--ds-space-md); }.form-error { margin-top: var(--ds-space-sm); color: var(--ds-danger); font-size: var(--ds-text-sm); }
.section-heading { margin-bottom: var(--ds-space-md); }.skill-card { width: 100%; display: flex; align-items: center; gap: var(--ds-space-lg); padding: var(--ds-space-lg); margin-bottom: var(--ds-space-lg); text-align: left; color: var(--ds-text-primary); border: 1px solid var(--ds-border-default); border-radius: var(--ds-radius-md); background: var(--ds-bg-secondary); cursor: pointer; transition: border-color var(--ds-transition-fast), background var(--ds-transition-fast); }.skill-card:hover, .skill-card.selected { border-color: var(--ds-border-strong); background: var(--ds-bg-tertiary); }.skill-icon { width: 38px; height: 38px; padding: 8px; border-radius: var(--ds-radius-sm); background: var(--ds-surface-active); color: var(--ds-text-secondary); }.skill-icon svg { display: block; width: 100%; height: 100%; }.skill-copy { min-width: 0; }.skill-copy strong, .match strong { display: block; font-size: var(--ds-text-base); }.skill-copy small, .match small { display: block; margin-top: 4px; color: var(--ds-text-tertiary); font-size: var(--ds-text-sm); }.skill-toggle { margin-left: auto; color: var(--ds-text-tertiary); font-size: var(--ds-text-sm); }
.config-card { margin-top: 0; }.card-heading h2 span { color: var(--ds-text-tertiary); font-size: var(--ds-text-sm); font-weight: 500; }.empty { padding: var(--ds-space-lg) 0; color: var(--ds-text-tertiary); font-size: var(--ds-text-sm); }.selection-tools { display: flex; gap: var(--ds-space-sm); margin: var(--ds-space-lg) 0 var(--ds-space-md); }.selection-tools input { flex: 1; min-width: 0; }.matches { max-height: 290px; border: 1px solid var(--ds-border-subtle); border-radius: var(--ds-radius-sm); overflow-y: auto; }.match { display: flex; align-items: center; gap: var(--ds-space-md); padding: var(--ds-space-md); border-bottom: 1px solid var(--ds-border-subtle); cursor: pointer; }.match:last-child { border-bottom: none; }.match:hover, .match.checked { background: var(--ds-surface-base); }.match strong { overflow-wrap: anywhere; } input[type=checkbox] { width: 15px; height: 15px; accent-color: var(--ds-primary); }.options { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--ds-space-lg); margin: var(--ds-space-xl) 0 var(--ds-space-sm); }.options label { color: var(--ds-text-secondary); font-size: var(--ds-text-sm); }.options input, .options select { display: block; width: 100%; margin-top: var(--ds-space-sm); }.options small { display: block; margin-top: 4px; color: var(--ds-text-muted); font-size: var(--ds-text-xs); }
.prompt-heading { display: flex; align-items: end; justify-content: space-between; gap: var(--ds-space-lg); margin-top: var(--ds-space-xl); margin-bottom: var(--ds-space-md); }.prompt-heading p { margin-top: 3px; }.ds-btn, input:not([type=checkbox]), select, textarea { font: inherit; }.ds-btn { min-height: 32px; padding: 6px 12px; border: 1px solid var(--ds-border-default); border-radius: var(--ds-radius-sm); color: var(--ds-text-secondary); background: var(--ds-surface-base); cursor: pointer; font-size: var(--ds-text-sm); }.ds-btn:hover:not(:disabled) { color: var(--ds-text-primary); background: var(--ds-surface-hover); border-color: var(--ds-border-strong); }.ds-btn-primary { color: var(--ds-primary-text); background: var(--ds-primary); border-color: var(--ds-primary); font-weight: 600; }.ds-btn-primary:hover:not(:disabled) { color: var(--ds-primary-text); background: var(--ds-primary-hover); }.ds-btn:disabled { opacity: .45; cursor: not-allowed; } button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible { outline: 2px solid var(--ds-primary); outline-offset: 2px; } input:not([type=checkbox]), select, textarea { padding: 8px 10px; border: 1px solid var(--ds-border-default); border-radius: var(--ds-radius-sm); color: var(--ds-text-primary); background: var(--ds-bg-primary); } textarea { width: 100%; resize: vertical; font-family: var(--ds-font-mono); font-size: var(--ds-text-xs); line-height: 1.7; }
@media (max-width: 700px) { .ai-skills { padding: var(--ds-space-lg) var(--ds-space-md) var(--ds-space-2xl); }.install-card, .config-card { padding: var(--ds-space-lg); }.options { grid-template-columns: 1fr; }.selection-tools { flex-wrap: wrap; }.selection-tools input { flex-basis: 100%; }.prompt-heading { align-items: flex-start; flex-direction: column; }.prompt-heading .ds-btn { width: 100%; }.skill-toggle { display: none; } }
</style>
