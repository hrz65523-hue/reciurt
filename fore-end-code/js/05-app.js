/* =====================================================================
 * 05-app.js
 * 应用外壳：共享状态、路由表、路由守卫、管理端/门户布局、登录页、数据看板
 * 依赖 00-helpers.js（h / El / Card 等）与 02-api.js（http）
 * ===================================================================== */

/* ---------- 共享状态（简易 store） ---------- */
const Store = Vue.reactive({
  user: null,           // 登录用户信息
  permissions: [],      // 权限点集合（RBAC）
  route: '/login',      // 当前哈希路由
  menuCollapsed: false, // 侧边栏折叠
  density: 'default',   // 表格密度：default 标准 / small 紧凑（一屏看更多行）
  ready: false          // 初始化完成标记
});
function go(path) {
  if (location.hash !== '#' + path) location.hash = path; else Store.route = path;
}
function hasPerm(code) {
  if (!code) return true;
  if (!Store.user) return false;
  if (Store.user.roleCode === 'ADMIN') return true;
  return Store.permissions.includes(code);
}
function isCandidate() { return !!(Store.user && Store.user.roleCode === 'CANDIDATE'); }

/* ---------- 路由表 ---------- */
const ROUTES = [
  { path: '/login', title: '登录', pub: true, comp: 'page-login' },
  { path: '/dashboard', title: '数据看板', perm: 'dashboard:view', group: '概览', comp: 'page-dashboard' },
  { path: '/jobs', title: '职位发布与编辑', perm: 'job:list', group: '职位管理', comp: 'page-job-list' },
  { path: '/job-categories', title: '职位类别管理', perm: 'job:category', group: '职位管理', comp: 'page-job-category' },
  { path: '/resumes', title: '简历投递与上传', perm: 'resume:list', group: '简历与候选人', comp: 'page-resume-list' },
  { path: '/candidates', title: '候选人库与标签', perm: 'candidate:list', group: '简历与候选人', comp: 'page-candidate-list' },
  { path: '/tags', title: '候选标签管理', perm: 'candidate:tag', group: '简历与候选人', comp: 'page-tags' },
  { path: '/flow', title: '简历筛选与状态流转', perm: 'flow:screen', group: '招聘流程', comp: 'page-flow' },
  { path: '/interviews', title: '面试安排与通知', perm: 'flow:interview', group: '招聘流程', comp: 'page-interview' },
  { path: '/offers', title: '面试评价与录用管理', perm: 'flow:offer', group: '招聘流程', comp: 'page-offer' },
  { path: '/users', title: '用户管理', perm: 'system:user', group: '系统管理', comp: 'page-users' },
  { path: '/roles', title: '角色与权限管理', perm: 'system:role', group: '系统管理', comp: 'page-roles' },
  { path: '/depts', title: '企业与部门管理', perm: 'system:dept', group: '系统管理', comp: 'page-depts' },
  { path: '/logs', title: '操作日志', perm: 'system:log', group: '系统管理', comp: 'page-logs' },
  { path: '/portal/jobs', title: '职位检索', pub: true, comp: 'page-portal-jobs' },
  { path: '/portal/job/:id', title: '职位详情', pub: true, comp: 'page-portal-job-detail' },
  { path: '/portal/mine', title: '我的投递与面试通知', comp: 'page-portal-mine' }
];
function matchRoute(path) {
  const p = (path || '/').split('?')[0];
  for (const r of ROUTES) {
    if (r.path === p) return { route: r, params: {} };
    if (r.path.includes(':')) {
      const rp = r.path.split('/'), pp = p.split('/');
      if (rp.length !== pp.length) continue;
      const params = {}; let ok = true;
      rp.forEach((seg, i) => {
        if (seg.startsWith(':')) params[seg.slice(1)] = decodeURIComponent(pp[i]);
        else if (seg !== pp[i]) ok = false;
      });
      if (ok) return { route: r, params };
    }
  }
  return { route: ROUTES[0], params: {} };
}
function syncRoute() { Store.route = location.hash.replace(/^#/, '') || '/login'; }
window.addEventListener('hashchange', syncRoute);

/* =====================================================================
 * 应聘者门户外壳（支持未登录游客浏览职位）
 * ===================================================================== */
const PortalShell = {
  setup() {
    const links = [{ path: '/portal/jobs', title: '职位检索' }, { path: '/portal/mine', title: '我的投递', needLogin: true }];
    function logout() {
      http.post('/auth/logout').catch(() => { }).then(() => {
        localStorage.removeItem('recruit_token');
        Store.user = null; Store.permissions = [];
        ElementPlus.ElMessage.success('已安全退出');
        go('/portal/jobs');
      });
    }
    return () => {
      const r = matchRoute(Store.route).route;
      const logged = !!Store.user;
      const right = links.map(l => h('span', {
        style: 'cursor:pointer;font-size:14px;color:' + (Store.route.startsWith(l.path) ? '#2f6fed' : '#64748b') +
          ';font-weight:' + (Store.route.startsWith(l.path) ? 600 : 400),
        onClick: () => go(l.needLogin && !logged ? '/login' : l.path)
      }, l.title)).concat(logged ? [
        El('Tag', { type: 'primary', effect: 'plain' }, () => '应聘者 · ' + Store.user.realName),
        Btn('退出登录', { size: 'small', type: 'danger', plain: true, onClick: logout })
      ] : [
        Primary('登录 / 注册', () => go('/login'), { size: 'small' })
      ]);
      return h('div', { class: 'layout', style: 'flex-direction:column' }, [
        h('div', { class: 'topbar', style: 'height:60px' }, [
          h('div', { class: 'left' }, [
            h('div', { style: 'width:28px;height:28px;border-radius:8px;background:#2f6fed;color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px' }, '聘'),
            h('span', '招聘管理系统 · 应聘者门户')
          ]),
          h('div', { class: 'right' }, right)
        ]),
        h('div', { class: 'content', style: 'padding:18px 20px 40px' }, [
          h('div', { style: 'max-width:1180px;margin:0 auto' }, [h(Vue.resolveComponent(r.comp))])
        ])
      ]);
    };
  }
};

/* =====================================================================
 * 管理端外壳（侧边菜单 + 顶栏）
 * ===================================================================== */
const AppShell = {
  setup() {
    const groups = Vue.computed(() => {
      const g = {};
      ROUTES.filter(r => r.group && hasPerm(r.perm)).forEach(r => { (g[r.group] = g[r.group] || []).push(r); });
      return g;
    });
    const groupIcon = { '概览': 'DataLine', '职位管理': 'Briefcase', '简历与候选人': 'Document', '招聘流程': 'Connection', '系统管理': 'Setting' };
    function logout() {
      http.post('/auth/logout').catch(() => { }).then(() => {
        localStorage.removeItem('recruit_token');
        Store.user = null; Store.permissions = [];
        ElementPlus.ElMessage.success('已安全退出');
        go('/login');
      });
    }
    return () => {
      const r = matchRoute(Store.route).route;
      const collapsed = Store.menuCollapsed;
      const menuNodes = [];
      Object.keys(groups.value).forEach(g => {
        menuNodes.push(h('div', { class: 'menu-group' }, collapsed ? g.slice(0, 2) : g));
        groups.value[g].forEach(item => {
          const active = Store.route.split('?')[0] === item.path || Store.route.startsWith(item.path + '?');
          menuNodes.push(h('div', {
            class: ['menu-item', active ? 'active' : ''],
            title: item.title,
            onClick: () => go(item.path)
          }, [
            h('span', { class: 'ico' }, [Ico(groupIcon[g] || 'Menu')]),
            collapsed ? null : h('span', item.title)
          ]));
        });
      });
      menuNodes.push(h('div', { class: 'menu-group' }, collapsed ? '门户' : '应聘者门户'));
      menuNodes.push(h('div', {
        class: ['menu-item', Store.route.startsWith('/portal') ? 'active' : ''],
        title: '职位检索门户', onClick: () => go('/portal/jobs')
      }, [h('span', { class: 'ico' }, [Ico('Search')]), collapsed ? null : h('span', '职位检索门户')]));

      return h('div', { class: 'layout' }, [
        h('div', { class: ['side', collapsed ? 'collapsed' : ''] }, [
          h('div', { class: 'brand' }, [
            h('div', { class: 'dot' }, '聘'),
            collapsed ? null : h('span', '招聘管理系统')
          ]),
          h('div', { class: 'side-menu' }, menuNodes)
        ]),
        h('div', { class: 'main' }, [
          h('div', { class: 'topbar' }, [
            h('div', { class: 'left' }, [
              h('span', { style: 'cursor:pointer;color:#64748b' , onClick: () => Store.menuCollapsed = !collapsed }, [Ico(collapsed ? 'Expand' : 'Fold')]),
              h('span', r.title),
              r.group ? h('span', { class: 'crumb' }, '/ ' + r.group) : null
            ]),
            h('div', { class: 'right' }, [
              El('Tag', { type: 'primary', effect: 'plain' }, () => (Store.user.roleName || '') + ' · ' + Store.user.realName),
              Btn(Store.density === 'large' ? '紧凑' : '宽松', {
                size: 'small',
                onClick: () => {
                  Store.density = Store.density === 'large' ? 'default' : 'large';
                  ElementPlus.ElMessage.success('已切换为' + (Store.density === 'large' ? '宽松' : '紧凑') + '表格');
                }
              }),
              Btn('门户预览', { size: 'small', onClick: () => go('/portal/jobs') }),
              Btn('退出登录', { size: 'small', type: 'danger', plain: true, onClick: logout })
            ])
          ]),
          h('div', { class: 'content' }, [h(Vue.resolveComponent(r.comp))])
        ])
      ]);
    };
  }
};

/* =====================================================================
 * 登录页
 * ===================================================================== */
const PageLogin = {
  setup() {
    const form = Vue.reactive({ username: 'admin', password: '123456' });
    const loading = Vue.ref(false);
    const accounts = [
      { u: 'admin', r: '系统管理员（全部权限）' },
      { u: 'hr', r: 'HR/招聘专员' },
      { u: 'ms', r: '面试官' },
      { u: 'cand', r: '应聘者' }
    ];
    async function submit() {
      if (!form.username || !form.password) { ElementPlus.ElMessage.warning('请输入用户名和密码'); return; }
      loading.value = true;
      try {
        const r = await http.post('/auth/login', form);
        if (r.code !== 200) { ElementPlus.ElMessage.error(r.message); return; }
        localStorage.setItem('recruit_token', r.data.token);
        Store.user = r.data.userInfo;
        Store.permissions = r.data.permissions;
        ElementPlus.ElMessage.success('欢迎回来，' + r.data.userInfo.realName);
        /* 若此前被路由守卫拦下，登录后回到原目标页 */
        const from = sessionStorage.getItem('recruit_from');
        sessionStorage.removeItem('recruit_from');
        const isCand = r.data.userInfo.roleCode === 'CANDIDATE';
        if (from && (isCand ? from.startsWith('/portal') : !from.startsWith('/portal'))) { go(from); return; }
        go(isCand ? '/portal/jobs' : (r.data.permissions.includes('dashboard:view') ? '/dashboard' : '/jobs'));
      } finally { loading.value = false; }
    }
    return () => h('div', { class: 'login-wrap' }, [
      h('div', { class: 'login-card' }, [
        h('div', { class: 'login-logo' }, [
          h('div', { class: 't' }, '招聘管理系统'),
          h('div', { class: 's' }, 'RECRUITMENT MANAGEMENT SYSTEM · VUE 3 + ELEMENT PLUS')
        ]),
        El('Form', { model: form, labelPosition: 'top', onSubmit: (e) => e.preventDefault() }, () => [
          El('FormItem', { label: '用户名' }, () => El('Input', {
            modelValue: form.username, 'onUpdate:modelValue': v => form.username = v,
            size: 'large', placeholder: '请输入用户名', clearable: true
          }, () => ({ prefix: () => Ico('User') }))),
          El('FormItem', { label: '密码' }, () => El('Input', {
            modelValue: form.password, 'onUpdate:modelValue': v => form.password = v,
            type: 'password', size: 'large', placeholder: '请输入密码', showPassword: true,
            onKeyup: (e) => { if (e.key === 'Enter') submit(); }
          }, () => ({ prefix: () => Ico('Lock') }))),
          El('Button', { type: 'primary', size: 'large', style: 'width:100%', loading: loading.value, onClick: submit }, () => '登 录')
        ]),
        h('div', { class: 'demo-box' }, [
          h('div', null, [h('b', '演示账号'), '：密码统一为 123456，点击下方账号可直接填充']),
          h('div', { class: 'demo-acc' }, accounts.map(a => h('span', {
            onClick: () => { form.username = a.u; form.password = '123456'; }
          }, a.u + ' · ' + a.r)))
        ])
      ])
    ]);
  }
};

/* =====================================================================
 * 数据看板（迭代5 的看板部分，先行提供）
 * 设计取向：简单高效 —— 一屏看完核心指标，无装饰性元素
 * ===================================================================== */
const PageDashboard = {
  setup() {
    const ov = Vue.reactive({});
    const funnel = Vue.ref([]);
    const rank = Vue.ref([]);
    const maxCount = Vue.computed(() => Math.max(1, ...funnel.value.map(f => f.count)));
    Vue.onMounted(async () => {
      const [a, b, c] = await Promise.all([
        http.get('/dashboard/overview'), http.get('/dashboard/funnel'), http.get('/dashboard/job-rank')
      ]);
      if (a.code === 200) Object.assign(ov, a.data);
      if (b.code === 200) funnel.value = b.data.funnel;
      if (c.code === 200) rank.value = c.data.slice(0, 5);
    });
    /* 只保留 4 个决策指标：在招职位 / 候选人 / 今日面试 / 待入职 */
    const stats = Vue.computed(() => [
      { l: '在招职位', n: ov.jobOnline, sub: '共 ' + (ov.jobTotal || 0) + ' 个', c: '#2f6fed', bg: '#e8f0fe', i: 'Briefcase' },
      { l: '候选人', n: ov.candidateTotal, sub: '已解析 ' + (ov.resumeTotal || 0) + ' 份简历', c: '#f59e0b', bg: '#fef3c7', i: 'User' },
      { l: '今日面试', n: ov.interviewToday, sub: '进行中 ' + (ov.interviewing || 0) + ' 人', c: '#0ea5e9', bg: '#e0f2fe', i: 'Calendar' },
      { l: '待入职', n: ov.offerPending, sub: '筛选通过率 ' + (ov.passRate || 0) + '%', c: '#16a34a', bg: '#dcfce7', i: 'Bell' }
    ]);
    return () => h(Vue.Fragment, null, [
      h('div', { class: 'stat-grid', style: 'grid-template-columns:repeat(4,1fr)' }, stats.value.map(s => h('div', { class: 'stat' }, [
        h('div', null, [
          h('div', { class: 'n', style: 'color:' + s.c }, String(s.n == null ? '—' : s.n)),
          h('div', { class: 'l' }, s.l + '　' + s.sub)
        ]),
        h('div', { class: 'ic', style: 'background:' + s.bg + ';color:' + s.c }, [Ico(s.i)])
      ]))),
      h('div', { style: 'display:grid;grid-template-columns:3fr 2fr;gap:16px;align-items:start' }, [
        Card('招聘漏斗', funnel.value.map(f => h('div', { class: 'funnel-row' }, [
          h('div', { class: 'name' }, f.stage),
          h('div', { style: 'flex:1;background:#f1f5f9;border-radius:5px' }, [
            h('div', { class: 'bar', style: 'width:' + Math.max(4, f.count / maxCount.value * 100) + '%' }, String(f.count))
          ]),
          h('div', { class: 'muted', style: 'width:52px;text-align:right' }, f.rate + '%')
        ]))),
        Card('职位投递 TOP5', [
          El('Table', { data: rank.value, size: 'small' }, () => [
            El('TableColumn', { prop: 'title', label: '职位', minWidth: 140, showOverflowTooltip: true }),
            El('TableColumn', { prop: 'applies', label: '投递', width: 60, align: 'right' }),
            El('TableColumn', { prop: 'views', label: '浏览', width: 60, align: 'right' })
          ])
        ])
      ])
    ]);
  }
};
