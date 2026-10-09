/* =====================================================================
 * 00-helpers.js
 * 渲染函数语法糖与页面骨架组件（供 03-pages.js / 04-portal.js 共用）
 * ===================================================================== */
const h = Vue.h;

/* 动态渲染 Element Plus 组件：El('Table', {...}, () => [...])
 * 统一注入表格密度（Store.density），列表页无需逐个传 size。 */
function El(name, props, children) {
  const c = Vue.resolveComponent('El' + name);
  let p = props;
  if (typeof Store !== 'undefined' && Store && name === 'Table' && p && p.size === undefined) {
    p = Object.assign({}, p, { size: Store.density === 'large' ? 'large' : 'default' });
  }
  return h(c, p, typeof children === 'function' ? { default: children } : children);
}
/* Element Plus 图标 */
function Ico(name, props) {
  return h(Vue.resolveComponent(name), Object.assign({ style: 'width:1em;height:1em' }, props || {}));
}
/* 按钮助手的两种调用约定（避免参数顺序写错）：
 *   Btn('文字', { type:'primary', onClick })         —— 仅传 props
 *   Btn('文字', () => {...}, { loading, size })      —— 传回调 + props
 * 若第二个参数是函数，则视为点击回调；否则视为 props（其中可含 onClick）。 */
const Btn = (label, a, b) => {
  let props, onClick;
  if (typeof a === 'function' || a === undefined || a === null) {
    props = Object.assign({}, b || {});
    onClick = a;
    if (props.onClick) { onClick = props.onClick; delete props.onClick; }
  } else {
    props = Object.assign({}, a || {});
    onClick = props.onClick || b;
    delete props.onClick;
  }
  return El('Button', Object.assign({ onClick: onClick }, props), () => label);
};
const Primary = (label, a, b) => {
  if (typeof a === 'function' || a === undefined || a === null) {
    return Btn(label, a, Object.assign({ type: 'primary' }, b || {}));
  }
  return Btn(label, Object.assign({ type: 'primary' }, a || {}), b);
};
const Span = (txt, style) => h('span', { style: style }, txt);
const Frag = (children) => h(Vue.Fragment, null, children);

/* 页面卡片 */
function Card(title, children, extra) {
  const head = title
    ? h('h3', null, [h('span', { class: 'bar' }), title, extra ? h('span', { style: 'margin-left:auto' }, extra) : null])
    : null;
  return h('div', { class: 'card' }, head ? [head].concat(children) : children);
}
/* 表单字段（无 ElForm 包裹场景，仅用于简单弹窗） */
function Field(label, control) {
  return El('FormItem', { label: label }, () => control);
}
/* 操作列：Ops([{label,type,onClick}]) */
function Ops(list) {
  const items = list.filter(Boolean);
  return h('div', { style: 'display:flex;gap:2px;flex-wrap:wrap;align-items:center' },
    items.map((it, i) => h(Vue.Fragment, { key: i }, [
      El('Button', { link: true, type: it.type || 'primary', size: 'small', onClick: it.onClick }, () => it.label),
      i < items.length - 1 ? h('span', { style: 'color:#dcdfe6' }, '|') : null
    ])));
}

/* ---------------------------------------------------------------------
 * 列表页通用分页逻辑
 * ------------------------------------------------------------------- */
function usePager(fetcher, defaultQuery) {
  const state = Vue.reactive({
    loading: false, list: [], total: 0, page: 1, size: 10,
    query: Object.assign({}, defaultQuery || {})
  });
  async function load() {
    state.loading = true;
    try {
      const r = await fetcher(Object.assign({ pageNum: state.page, pageSize: state.size }, state.query));
      if (!r || r.code !== 200) { ElementPlus.ElMessage.error((r && r.message) || '加载失败'); return; }
      state.list = r.data.list;
      state.total = r.data.total;
    } catch (e) {
      ElementPlus.ElMessage.error('请求异常：' + e.message);
    } finally { state.loading = false; }
  }
  function search() { state.page = 1; load(); }
  function reset() { Object.assign(state.query, defaultQuery || {}); state.page = 1; load(); }
  function onPage(e) { state.page = e.page; state.size = e.size; load(); }
  return { state, load, search, reset, onPage };
}

/* ---------------------------------------------------------------------
 * 分页条组件（注册为全局组件 pager）
 * ------------------------------------------------------------------- */
const Pager = {
  props: { total: Number, page: Number, size: Number },
  emits: ['change'],
  setup(props, { emit }) {
    return () => h('div', { style: 'display:flex;justify-content:flex-end;margin-top:14px' }, [
      El('Pagination', {
        background: true, layout: 'total, prev, pager, next, sizes',
        total: props.total, currentPage: props.page, pageSize: props.size,
        pageSizes: [10, 20, 50],
        onCurrentChange: (v) => emit('change', { page: v, size: props.size }),
        onSizeChange: (v) => emit('change', { page: 1, size: v })
      })
    ]);
  }
};

/* ---------------------------------------------------------------------
 * 状态标签组件
 * ------------------------------------------------------------------- */
const AppStatusTag = {
  props: { status: Number },
  setup(p) {
    return () => El('Tag', { size: 'small', type: APP_STATUS_TYPE[p.status] || 'info' }, () => APP_STATUS[p.status] || '—');
  }
};
const JobStatusTag = {
  props: { status: Number },
  setup(p) {
    return () => El('Tag', { size: 'small', type: JOB_STATUS_TYPE[p.status] || 'info' }, () => JOB_STATUS[p.status] || '—');
  }
};
const TagChip = {
  props: { tag: Object },
  setup(p) {
    return () => El('Tag', { size: 'small', color: p.tag.color, effect: 'dark', style: 'border:none' }, () => p.tag.name);
  }
};

/* 树转平铺（用于下拉选择） */
function flattenTree(nodes, out, level) {
  out = out || []; level = level || 0;
  (nodes || []).forEach(n => {
    out.push({ id: n.id, name: n.name, level: level });
    if (n.children && n.children.length) flattenTree(n.children, out, level + 1);
  });
  return out;
}

/* 常用格式化 */
function fmtMoney(job) {
  if (!job || job.salaryMin == null || job.salaryMax == null) return '面议';
  return job.salaryMin + 'K-' + job.salaryMax + 'K';
}
function fmtDate(v, withTime) {
  if (!v) return '—';
  return withTime ? String(v).slice(0, 16) : String(v).slice(0, 10);
}
function todayStr() { return new Date().toISOString().slice(0, 10); }
