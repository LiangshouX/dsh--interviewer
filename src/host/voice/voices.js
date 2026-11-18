/**
 * 模型 → 音色对照表（内部维护，设置页音色下拉的唯一真源）。
 *
 * **为什么要有这张表。** DashScope/CosyVoice 这类模型「每个模型只支持一组特定
 * 音色」——把一个模型的音色填给另一个模型，服务端直接报 InvalidParameter
 * （例如 `[cosyvoice:]Engine error [411]: TTS speak operation failed`）。
 * 所以音色不能让用户随手填，得按当前模型给出**它真正支持的那一组**。
 *
 * **数据来源（权威、完整）：** 阿里云百炼官方 Qwen-Audio-TTS 音色列表
 * （help.aliyun.com/zh/model-studio/qwen-audio-tts-voice-list），按模型分段逐条核对。
 * 注意各模型音色数量差异很大：**plus 是旗舰音色、数量少**（3.0-tts-plus 仅 2 个、
 * 3.1-tts-plus 4 个），**flash 音色多**（3.0-tts-flash 12 个、3.1-tts-flash 139 个）。
 * 「plus 音色少」是模型本身的供给，不是表漏了。音色 id 是功能正确性的关键，
 * label 是给人看的中文名 + 性别。
 *
 * **边界：** 这张表只覆盖**系统音色**。音色复刻 / 音色设计产生的自定义音色
 * 不在表里——那条路尚未实现（见 README「待办」），未知模型/音色回落文本输入。
 *
 * 维护纪律：新增模型 = 在 MODEL_VOICES 里加一组（id 必须来自官方列表）；
 * 前端不许另硬编码一份。
 */

/**
 * 按**模型 id** 精确匹配的系统音色表。
 * 键是模型 id（与 TTS 请求里的 model 一致），值是该模型支持的音色。
 */
export const MODEL_VOICES = {
  "qwen-audio-3.0-tts-plus": [
    { id: "longanlingxin", label: "龙安灵心（女）", gender: "female" },
    { id: "longanlufeng", label: "龙安鲁风（男）", gender: "male" },
  ],
  "qwen-audio-3.0-tts-flash": [
    { id: "longanfengyue", label: "龙安风悦（女）", gender: "female" },
    { id: "longanyuanfei", label: "龙安元妃（女）", gender: "female" },
    { id: "longanlingxi", label: "龙安灵希（女）", gender: "female" },
    { id: "longanxiaoxin", label: "龙安小昕（女）", gender: "female" },
    { id: "longanhuan_v3.6", label: "龙安欢（女）", gender: "female" },
    { id: "longjielidou_v3.6", label: "龙杰力豆（男）", gender: "male" },
    { id: "longpaopao_v3.6", label: "龙泡泡（女）", gender: "female" },
    { id: "longhuohuo_v3.6", label: "龙火火（男）", gender: "male" },
    { id: "longchuanshu_v3.6", label: "龙川叔（男）", gender: "male" },
    { id: "loongmary", label: "loongmary（女）", gender: "female" },
    { id: "loongeva_v3.6", label: "loongeva（女）", gender: "female" },
    { id: "loongjohn", label: "loongJohn（男）", gender: "male" },
  ],
  "qwen-audio-3.1-tts-plus": [
    { id: "longanlingxin_v3.1", label: "龙安灵心_v3.1（女）", gender: "female" },
    { id: "xunanchuan_v3.1", label: "许南川（男）", gender: "male" },
    { id: "longanhuan_v3.1", label: "龙安欢_v3.1（女）", gender: "female" },
    { id: "longanfengyue_v3.1", label: "龙安风悦_v3.1（女）", gender: "female" },
  ],
  "qwen-audio-3.1-tts-flash": [
    { id: "longanhuan_v3.1", label: "龙安欢_v3.1（女）", gender: "female" },
    { id: "longanlingxin_v3.1", label: "龙安灵心_v3.1（女）", gender: "female" },
    { id: "longanfengyue_v3.1", label: "龙安风悦_v3.1（女）", gender: "female" },
    { id: "xunanchuan_v3.1", label: "许南川（男）", gender: "male" },
    { id: "yuxiaoyun_v3.1", label: "于小云（女）", gender: "female" },
    { id: "qiaoxiaojiao_v3.1", label: "乔小娇（女）", gender: "female" },
    { id: "xiaxiaochen_v3.1", label: "夏小晨（女）", gender: "female" },
    { id: "anmingyuan_v3.1", label: "安明远（男）", gender: "male" },
    { id: "wenhuaiqing_v3.1", label: "温怀清（女）", gender: "female" },
    { id: "anxiaolan_v3.1", label: "安小岚（女）", gender: "female" },
    { id: "xieshurou_v3.1", label: "谢舒柔（女）", gender: "female" },
    { id: "baiqinglan_v3.1", label: "白清岚（女）", gender: "female" },
    { id: "xuyuyuan_v3.1", label: "许玉远（女）", gender: "female" },
    { id: "anruorou_v3.1", label: "安若柔（女）", gender: "female" },
    { id: "wenhuaizhi_v3.1", label: "闻怀之（女）", gender: "female" },
    { id: "xiaoxingzhi_v3.1", label: "萧行之（女）", gender: "female" },
    { id: "guyunshu_v3.1", label: "顾云舒（女）", gender: "female" },
    { id: "huozhuoshi_v3.1", label: "霍拙石（男）", gender: "male" },
    { id: "yeqinghe_v3.1", label: "叶清禾（女）", gender: "female" },
    { id: "yunhuanhuan_v3.1", label: "云欢欢（女）", gender: "female" },
    { id: "xuxiaoqiao_v3.1", label: "徐小俏（女）", gender: "female" },
    { id: "baianran_v3.1", label: "白安然（女）", gender: "female" },
    { id: "xuyanchu_v3.1", label: "许言初（女）", gender: "female" },
    { id: "yezhiqing_v3.1", label: "叶知晴（女）", gender: "female" },
    { id: "andi_v3.1", label: "安迪（男）", gender: "male" },
    { id: "anyuqing_v3.1", label: "安语晴（女）", gender: "female" },
    { id: "linxiaoling_v3.1", label: "林小灵（女）", gender: "female" },
    { id: "longfeifei_v3.1", label: "龙菲菲_v3.1（女）", gender: "female" },
    { id: "longjing_v3.1", label: "龙婧_v3.1（女）", gender: "female" },
    { id: "longqiang_v3.1", label: "龙嫱_v3.1（女）", gender: "female" },
    { id: "longyan_v3.1", label: "龙颜_v3.1（女）", gender: "female" },
    { id: "longxiaobai_v3.1", label: "龙小白_v3.1（女）", gender: "female" },
    { id: "longyue_v3.1", label: "龙悦_v3.1（女）", gender: "female" },
    { id: "longcheng_v3.1", label: "龙橙_v3.1（男）", gender: "male" },
    { id: "longlaotie_v3.1", label: "龙老铁_v3.1（男）", gender: "male" },
    { id: "longshao_v3.1", label: "龙邵_v3.1（男）", gender: "male" },
    { id: "longshu_v3.1", label: "龙书_v3.1（男）", gender: "male" },
    { id: "longze_v3.1", label: "龙泽_v3.1（男）", gender: "male" },
    { id: "longhao_v3.1", label: "龙浩_v3.1（男）", gender: "male" },
    { id: "longjin_v3.1", label: "龙津_v3.1（男）", gender: "male" },
    { id: "longnan_v3.1", label: "龙楠_v3.1（男）", gender: "male" },
    { id: "longshuo_v3.1", label: "龙硕_v3.1（男）", gender: "male" },
    { id: "longtian_v3.1", label: "龙天_v3.1（男）", gender: "male" },
    { id: "longxiaocheng_v3.1", label: "龙小诚_v3.1（男）", gender: "male" },
    { id: "longke_v3.1", label: "龙可_v3.1" },
    { id: "loongbella_v3.1", label: "Bella_v3.1（女）", gender: "female" },
    { id: "Emily_v3.1", label: "Emily（女）", gender: "female" },
    { id: "Luna_v3.1", label: "Luna（女）", gender: "female" },
    { id: "Eric_v3.1", label: "Eric（男）", gender: "male" },
    { id: "Luca_v3.1", label: "Luca（男）", gender: "male" },
    { id: "Abby_v3.1", label: "Abby（女）", gender: "female" },
    { id: "Annie_v3.1", label: "Annie（女）", gender: "female" },
    { id: "Ava_v3.1", label: "Ava（女）", gender: "female" },
    { id: "Beth_v3.1", label: "Beth（女）", gender: "female" },
    { id: "Betty_v3.1", label: "Betty（女）", gender: "female" },
    { id: "Cally_v3.1", label: "Cally（女）", gender: "female" },
    { id: "Cindy_v3.1", label: "Cindy（女）", gender: "female" },
    { id: "Donna_v3.1", label: "Donna（女）", gender: "female" },
    { id: "Andy_v3.1", label: "Andy（男）", gender: "male" },
    { id: "Brian_v3.1", label: "Brian（男）", gender: "male" },
    { id: "David_v3.1", label: "David（男）", gender: "male" },
    { id: "longanyuanfei_v3.1", label: "龙安元妃_v3.1（女）", gender: "female" },
    { id: "longjielidou_v3.1", label: "龙杰力豆_v3.1（男）", gender: "male" },
    { id: "longanlingxi_v3.1", label: "龙安灵希_v3.1（女）", gender: "female" },
    { id: "longhuohuo_v3.1", label: "龙火火_v3.1（男）", gender: "male" },
    { id: "longyingtao_v3.1", label: "龙应桃_v3.1（女）", gender: "female" },
    { id: "longanya_v3.1", label: "龙安雅_v3.1（女）", gender: "female" },
    { id: "longwan_v3.1", label: "龙婉_v3.1（女）", gender: "female" },
    { id: "longxing_v3.1", label: "龙星_v3.1（女）", gender: "female" },
    { id: "longhua_v3.1", label: "龙华_v3.1（女）", gender: "female" },
    { id: "longhan_v3.1", label: "龙寒_v3.1（男）", gender: "male" },
    { id: "longanzhi_v3.1", label: "龙安智_v3.1（男）", gender: "male" },
    { id: "longzhe_v3.1", label: "龙哲_v3.1（男）", gender: "male" },
    { id: "longanyang_v3.1", label: "龙安洋_v3.1（男）", gender: "male" },
    { id: "libai_v3.1", label: "李白_v3.1（男）", gender: "male" },
    { id: "longling_v3.1", label: "龙铃_v3.1（女）", gender: "female" },
    { id: "longniuniu_v3.1", label: "龙牛牛_v3.1（男）", gender: "male" },
    { id: "longshanshan_v3.1", label: "龙闪闪_v3.1（男）", gender: "male" },
    { id: "longpaopao_v3.1", label: "龙泡泡_v3.1（女）", gender: "female" },
    { id: "loongstella_v3.1", label: "loongstella_v3.1（女）", gender: "female" },
    { id: "longyuan_v3.1", label: "龙媛_v3.1（女）", gender: "female" },
    { id: "longmiao_v3.1", label: "龙妙_v3.1（女）", gender: "female" },
    { id: "longsanshu_v3.1", label: "龙三叔_v3.1（男）", gender: "male" },
    { id: "longanli_v3.1", label: "龙安莉_v3.1（女）", gender: "female" },
    { id: "longanwen_v3.1", label: "龙安温_v3.1（女）", gender: "female" },
    { id: "longanlang_v3.1", label: "龙安朗_v3.1（男）", gender: "male" },
    { id: "longxiaoxia_v3.1", label: "龙小夏_v3.1（女）", gender: "female" },
    { id: "longanchong_v3.1", label: "龙安冲_v3.1（男）", gender: "male" },
    { id: "qwen-audio-3.1-tts-flash-zora_bg", label: "Zora（男）", gender: "male" },
    { id: "qwen-audio-3.1-tts-flash-linde_nl", label: "Linde（男）", gender: "male" },
    { id: "qwen-audio-3.1-tts-flash-hajnal_hu", label: "Hajnal（女）", gender: "female" },
    { id: "qwen-audio-3.1-tts-flash-senin_ro", label: "Senin（男）", gender: "male" },
    { id: "qwen-audio-3.1-tts-flash-birk_da", label: "Birk（男）", gender: "male" },
    { id: "qwen-audio-3.1-tts-flash-lipa_hr", label: "Lipa（男）", gender: "male" },
    { id: "qwen-audio-3.1-tts-flash-avgi_el", label: "Avgi（男）", gender: "male" },
    { id: "qwen-audio-3.1-tts-flash-jitrenka_cs", label: "Jitrenka（男）", gender: "male" },
    { id: "qwen-audio-3.1-tts-flash-solglimt_nn", label: "Solglimt（男）", gender: "male" },
    { id: "qwen-audio-3.1-tts-flash-glimma_sv", label: "Glimma（女）", gender: "female" },
    { id: "qwen-audio-3.1-tts-flash-svar_hi", label: "Svar（男）", gender: "male" },
    { id: "qwen-audio-3.1-tts-flash-iskra_sk", label: "Iskra（女）", gender: "female" },
    { id: "qwen-audio-3.1-tts-flash-aava_fi", label: "Aava（男）", gender: "male" },
    { id: "qwen-audio-3.1-tts-flash-sahar_ur", label: "Sahar（男）", gender: "male" },
    { id: "qwen-audio-3.1-tts-flash-jasna_sr", label: "Jasna（男）", gender: "male" },
    { id: "qwen-audio-3.1-tts-flash-brisa_es_mx", label: "Brisa（女）", gender: "female" },
    { id: "qwen-audio-3.1-tts-flash-ausra_lt", label: "Ausra（男）", gender: "male" },
    { id: "qwen-audio-3.1-tts-flash-rasa_lv", label: "Rasa（女）", gender: "female" },
    { id: "qwen-audio-3.1-tts-flash-deniz_tr", label: "Deniz（男）", gender: "male" },
    { id: "qwen-audio-3.1-tts-flash-ava_fa", label: "Ava（男）", gender: "male" },
    { id: "qwen-audio-3.1-tts-flash-or_he", label: "Or（男）", gender: "male" },
    { id: "qwen-audio-3.1-tts-flash-ayalguu_mn", label: "Ayalguu（男）", gender: "male" },
    { id: "qwen-audio-3.1-tts-flash-zarja_sl", label: "Zarja（男）", gender: "male" },
    { id: "qwen-audio-3.1-tts-flash-ishiq_az", label: "Ishiq（男）", gender: "male" },
    { id: "qwen-audio-3.1-tts-flash-zorza_pl", label: "Zorza（男）", gender: "male" },
    { id: "qwen-audio-3.1-tts-flash-alba_ca", label: "Alba（男）", gender: "male" },
    { id: "qwen-audio-3.1-tts-flash-romduol_km", label: "Romduol（男）", gender: "male" },
    { id: "qwen-audio-3.1-tts-flash-aurora_pt_br", label: "Aurora（男）", gender: "male" },
    { id: "qwen-audio-3.1-tts-flash-dao_lo", label: "Dao（男）", gender: "male" },
    { id: "qwen-audio-3.1-tts-flash-tsiskari_ka", label: "Tsiskari（男）", gender: "male" },
    { id: "qwen-audio-3.1-tts-flash-lente_af", label: "Lente（女）", gender: "female" },
    { id: "qwen-audio-3.1-tts-flash-kiran_ne", label: "Kiran（男）", gender: "male" },
    { id: "qwen-audio-3.1-tts-flash-zorka_be", label: "Zorka（女）", gender: "female" },
    { id: "qwen-audio-3.1-tts-flash-nilaav_ml", label: "Nilaav（女）", gender: "female" },
    { id: "qwen-audio-3.1-tts-flash-staer_lb", label: "Staer（女）", gender: "female" },
    { id: "qwen-audio-3.1-tts-flash-drita_sq", label: "Drita（男）", gender: "male" },
    { id: "qwen-audio-3.1-tts-flash-nila_ta", label: "Nila（女）", gender: "female" },
    { id: "qwen-audio-3.1-tts-flash-aruna_si", label: "Aruna（男）", gender: "male" },
    { id: "qwen-audio-3.1-tts-flash-vennela_te", label: "Vennela（男）", gender: "male" },
    { id: "qwen-audio-3.1-tts-flash-sade_et", label: "Sade（女）", gender: "female" },
    { id: "qwen-audio-3.1-tts-flash-bituon_ceb", label: "Bituon（男）", gender: "male" },
    { id: "qwen-audio-3.1-tts-flash-vedrina_bs", label: "Vedrina（女）", gender: "female" },
    { id: "qwen-audio-3.1-tts-flash-layaung_my", label: "LaYaung（男）", gender: "male" },
    { id: "qwen-audio-3.1-tts-flash-luys_hy", label: "Luys（女）", gender: "female" },
    { id: "qwen-audio-3.1-tts-flash-lumen_la", label: "Lumen（男）", gender: "male" },
    { id: "qwen-audio-3.1-tts-flash-birta_is", label: "Birta（男）", gender: "male" },
    { id: "qwen-audio-3.1-tts-flash-zerniq_mt", label: "Zerniq（女）", gender: "female" },
    { id: "qwen-audio-3.1-tts-flash-nuru_sw", label: "Nuru（女）", gender: "female" },
    { id: "qwen-audio-3.1-tts-flash-arai_kk", label: "Arai（男）", gender: "male" },
    { id: "qwen-audio-3.1-tts-flash-zetwal_crs", label: "Zetwal（女）", gender: "female" },
    { id: "qwen-audio-3.1-tts-flash-zoria_uk", label: "Zoria（男）", gender: "male" },
  ],
}

/**
 * 按**服务商**给的音色（这些家的音色是 provider 级、跨模型通用的）。
 * 只放拿得准的；拿不准的家（mimo/minimax）留空 → 回落文本输入，不臆造 id。
 */
export const PROVIDER_VOICES = {
  openai: [
    { id: 'alloy', label: 'alloy' },
    { id: 'echo', label: 'echo' },
    { id: 'fable', label: 'fable' },
    { id: 'onyx', label: 'onyx' },
    { id: 'nova', label: 'nova' },
    { id: 'shimmer', label: 'shimmer' },
  ],
  // MiMo 的预置音色（仅 mimo-v2.5-tts；voicedesign 不传 voice、voiceclone 传参考音频）。
  // 音色 id 就是中文字符串本身，别翻译。
  mimo: [
    { id: 'mimo_default', label: '默认（冰糖 / Mia）' },
    { id: '冰糖', label: '冰糖（女 · 清爽）' },
    { id: '茉莉', label: '茉莉（女 · 轻柔）' },
    { id: '苏打', label: '苏打（男 · 年轻）' },
    { id: '白桦', label: '白桦（男 · 沉稳）' },
    { id: 'Mia', label: 'Mia（女 · 英文）' },
    { id: 'Chloe', label: 'Chloe（女 · 英文慢）' },
    { id: 'Milo', label: 'Milo（男 · 英文慢）' },
    { id: 'Dean', label: 'Dean（男 · 英文）' },
  ],
  // MiniMax 经典中文音色（跨代通用）；新式 `Chinese (Mandarin)_*` 太多，留给文本输入。
  minimax: [
    { id: 'female-shaonv', label: '少女（女 · 默认）' },
    { id: 'female-yujie', label: '御姐（女）' },
    { id: 'female-chengshu', label: '成熟女性（女）' },
    { id: 'female-tianmei', label: '甜美女性（女）' },
    { id: 'male-qn-qingse', label: '青涩青年（男）' },
    { id: 'male-qn-jingying', label: '精英青年（男）' },
    { id: 'male-qn-badao', label: '霸道青年（男）' },
    { id: 'male-qn-daxuesheng', label: '青年大学生（男）' },
  ],
}

/**
 * 查当前模型/服务商支持的音色。
 *
 * 优先按模型 id 精确匹配（DashScope 必须按模型）；模型不在表里时退到服务商级；
 * 都没有 → `known:false`，界面回落文本输入（自定义音色 / 音色克隆的出路）。
 *
 * @param {string} model
 * @param {string} provider
 * @returns {{known: boolean, scope: 'model'|'provider'|'none', voices: Array<{id: string, label: string}>}}
 */
export function voicesFor(model, provider) {
  const m = String(model ?? '').trim()
  if (m !== '' && Array.isArray(MODEL_VOICES[m]) && MODEL_VOICES[m].length > 0) {
    return { known: true, scope: 'model', voices: MODEL_VOICES[m] }
  }
  const p = String(provider ?? '').trim()
  if (p !== '' && Array.isArray(PROVIDER_VOICES[p]) && PROVIDER_VOICES[p].length > 0) {
    return { known: true, scope: 'provider', voices: PROVIDER_VOICES[p] }
  }
  return { known: false, scope: 'none', voices: [] }
}

/**
 * 某模型的默认音色（列表第一个）。voice 留空时用它兜底，
 * 保证「换模型后默认音色仍然合法」，而不是拿上一个模型的音色去撞 411。
 *
 * @param {string} model
 * @returns {string}
 */
export function defaultVoiceForModel(model) {
  const m = String(model ?? '').trim()
  const list = MODEL_VOICES[m]
  return Array.isArray(list) && list.length > 0 ? list[0].id : ''
}

/** 给面板的整张表（随设置快照下发，前端不硬编码）。 */
export function voiceTable() {
  return { models: MODEL_VOICES, providers: PROVIDER_VOICES }
}
