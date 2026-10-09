/* =====================================================================
 * 03-pages.js
 * 管理端页面：用户与权限 / 职位管理 / 简历与候选人 / 招聘流程 / 系统管理
 * 全部使用 Vue3 组合式 API + 渲染函数（无构建步骤，浏览器直接运行）
 * ===================================================================== */

/* 依赖 00-helpers.js 提供的：h / El / Ico / Btn / Primary / Span / Frag / Card /
 * Field / Ops / usePager / Pager / AppStatusTag / JobStatusTag / TagChip / flattenTree */

/* =====================================================================
 * 简历解析对话框（管理端上传 + 应聘者投递共用）
 * ===================================================================== */
const ResumeParseDialog = {
  props: { modelValue: Boolean },
  emits: ['update:modelValue', 'parsed'],
  setup(props, { emit }) {
    const file = Vue.ref(null);
    const parsed = Vue.reactive({});
    const parsing = Vue.ref(false);
    const uploading = Vue.ref(false);
    const uploaded = Vue.ref(false);
    const visible = Vue.computed({
      get: () => props.modelValue,
      set: v => emit('update:modelValue', v)
    });
    function reset() {
      file.value = null;
      Object.keys(parsed).forEach(k => delete parsed[k]);
      uploaded.value = false; uploading.value = false; parsing.value = false;
    }
    async function onPick(ev) {
      const raw = ev.target.files && ev.target.files[0];
      if (!raw) return;
      const ext = (raw.name.split('.').pop() || '').toLowerCase();
      if (!['pdf', 'doc', 'docx'].includes(ext)) { ElementPlus.ElMessage.error('仅支持 PDF / DOC / DOCX 格式'); return; }
      file.value = raw;
      uploading.value = true;
      try {
        const up = await http.upload('/resume/upload', raw);
        if (up.code !== 200) { ElementPlus.ElMessage.error(up.message); return; }
        uploaded.value = true;
        await doParse(raw.name);
      } finally { uploading.value = false; }
    }
    async function doParse(fileName) {
      parsing.value = true;
      try {
        const r = await http.post('/resume/parse', { fileName: fileName || (file.value && file.value.name) });
        if (r.code !== 200) { ElementPlus.ElMessage.error(r.message); return; }
        Object.assign(parsed, r.data);
        ElementPlus.ElMessage.success('解析完成，识别率 ' + Math.round((r.data.parseRate || 0) * 100) + '%，请核对信息');
      } finally { parsing.value = false; }
    }
    function confirm() {
      if (!uploaded.value) { ElementPlus.ElMessage.warning('请先上传并解析简历文件'); return; }
      emit('parsed', Object.assign({ resumeName: file.value.name, parsed: 1 }, parsed));
      visible.value = false;
    }
    const DropZone = () => h('div', { style: 'text-align:center;padding:22px 0;border:1px dashed #cbd5e1;border-radius:10px;background:#fafcff' }, [
      Ico('UploadFilled', { style: 'width:38px;height:38px;color:#c0c4cc' }),
      h('div', { style: 'color:#606266;font-size:13.5px;margin:8px 0 12px' }, '选择本地简历文件（PDF / DOC / DOCX），系统将自动解析并结构化'),
      h('label', {
        style: 'display:inline-block;padding:7px 18px;background:#2f6fed;color:#fff;border-radius:6px;cursor:pointer;font-size:13.5px'
      }, ['选择简历文件', h('input', {
        type: 'file', accept: '.pdf,.doc,.docx', style: 'display:none', onChange: onPick
      })]),
      file.value ? h('div', { class: 'muted', style: 'margin-top:10px' }, '已选择：' + file.value.name + (uploading.value ? '（上传中…）' : uploaded.value ? '（已上传）' : '')) : null
    ]);
    return () => !visible.value ? null : El('Dialog', {
      modelValue: true, 'onUpdate:modelValue': v => visible.value = v,
      title: '上传简历并自动解析', width: '640px', top: '6vh', onClosed: reset
    }, {
      default: () => [
        h('div', { class: 'note' }, '自动提取姓名、联系方式、学历、工作经历等字段并结构化存储，解析后建议人工核对。'),
        DropZone(),
        Object.keys(parsed).length ? El('Descriptions', { column: 2, border: true, size: 'small', title: '解析结果', style: 'margin-top:16px' }, () => [
          El('DescriptionsItem', { label: '姓名' }, () => parsed.candidateName),
          El('DescriptionsItem', { label: '性别' }, () => (parsed.gender === 1 ? '男' : parsed.gender === 2 ? '女' : '—')),
          El('DescriptionsItem', { label: '手机号' }, () => parsed.phone),
          El('DescriptionsItem', { label: '邮箱' }, () => parsed.email),
          El('DescriptionsItem', { label: '学历' }, () => parsed.education),
          El('DescriptionsItem', { label: '毕业院校' }, () => parsed.school),
          El('DescriptionsItem', { label: '专业' }, () => parsed.major),
          El('DescriptionsItem', { label: '工作年限' }, () => parsed.workYears),
          El('DescriptionsItem', { label: '期望岗位', span: 2 }, () => parsed.latestCompany),
          El('DescriptionsItem', { label: '技能标签', span: 2 }, () => (parsed.skills || []).join('、'))
        ]) : (parsing.value ? h('div', { class: 'muted', style: 'margin-top:14px' }, '正在解析简历内容…') : null)
      ],
      footer: () => [
        Btn('重新解析', { disabled: !file.value, loading: parsing.value, onClick: () => file.value && doParse() }),
        Btn('取消', { onClick: () => visible.value = false }),
        Primary('确认并加入候选人库', confirm, { disabled: !uploaded.value })
      ]
    });
  }
};

/* =====================================================================
 * 1. 职位管理：职位发布与编辑（迭代2）
 * ===================================================================== */
const PageJobList = {
  setup() {
    const pager = usePager((p) => http.get('/jobs', p), { keyword: '', categoryId: '', status: '', city: '' });
    const { state } = pager;
    const cats = Vue.ref([]);
    const depts = Vue.ref([]);
    const dialog = Vue.ref(false);
    const form = Vue.reactive({});
    const saving = Vue.ref(false);
    const detail = Vue.ref(null);
    const detailVisible = Vue.ref(false);

    Vue.onMounted(async () => {
      const [c, d] = await Promise.all([http.get('/job/categories'), http.get('/system/depts/tree')]);
      if (c.code === 200) cats.value = c.data;
      if (d.code === 200) depts.value = flattenTree(d.data);
      pager.load();
    });
    const emptyForm = () => ({
      id: null, title: '', categoryId: null, deptId: null, jobType: 1, city: '深圳',
      salaryMin: 10, salaryMax: 20, headcount: 1, eduReq: '本科', expReq: '1-3年',
      tags: [], description: '', requirement: '', deadline: daysLater(30), status: 0
    });
    function openAdd() {
      /* 必须重置 id，否则会复用上次编辑的行，把「新增」变成「更新」 */
      Object.assign(form, emptyForm());
      dialog.value = true;
    }
    function openEdit(row) {
      Object.assign(form, JSON.parse(JSON.stringify(row)));
      dialog.value = true;
    }
    async function save() {
      if (!form.title) { ElementPlus.ElMessage.warning('请填写职位名称'); return; }
      if (form.categoryId == null) { ElementPlus.ElMessage.warning('请选择职位类别'); return; }
      if (Number(form.salaryMin) > Number(form.salaryMax)) { ElementPlus.ElMessage.warning('薪资下限不能大于上限'); return; }
      saving.value = true;
      try {
        const r = form.id ? await http.put('/jobs/' + form.id, form) : await http.post('/jobs', form);
        if (r.code !== 200) { ElementPlus.ElMessage.error(r.message); return; }
        ElementPlus.ElMessage.success(r.message);
        dialog.value = false;
        pager.load();
      } finally { saving.value = false; }
    }
    async function changeStatus(row, status, reason) {
      const r = await http.put('/jobs/' + row.id + '/status', { status: status, reason: reason || '' });
      if (r.code !== 200) { ElementPlus.ElMessage.error(r.message); return false; }
      ElementPlus.ElMessage.success('「' + row.title + '」' + r.message);
      pager.load();
      return true;
    }
    function shelf(row, status) {
      if (status === 2) {
        ElementPlus.ElMessageBox.prompt('请填写下线原因（可选）', '下线职位', { inputPlaceholder: '如：岗位已招满' })
          .then(({ value }) => changeStatus(row, 2, value)).catch(() => { });
      } else if (status === 3) {
        ElementPlus.ElMessageBox.confirm('关闭后该职位不可重新发布，确认关闭「' + row.title + '」？', '关闭职位', { type: 'warning' })
          .then(() => changeStatus(row, 3)).catch(() => { });
      } else changeStatus(row, status);
    }
    function remove(row) {
      ElMessageBox_confirm('删除后不可恢复，确认删除职位「' + row.title + '」？').then(async () => {
        const r = await http.del('/jobs/' + row.id);
        if (r.code !== 200) { ElementPlus.ElMessage.error(r.message); return; }
        ElementPlus.ElMessage.success('删除成功');
        pager.load();
      }).catch(() => { });
    }
    const ElMessageBox_confirm = (msg) => ElementPlus.ElMessageBox.confirm(msg, '提示', { type: 'warning' });
    async function openDetail(row) {
      const r = await http.get('/jobs/' + row.id);
      if (r.code !== 200) { ElementPlus.ElMessage.error(r.message); return; }
      detail.value = r.data; detailVisible.value = true;
    }

    const moreFilter = Vue.ref(false);
    return () => Card('职位列表', [
      h('div', { class: 'toolbar' }, [
        El('Input', { modelValue: state.query.keyword, 'onUpdate:modelValue': v => state.query.keyword = v, placeholder: '搜索职位名称', clearable: true, style: 'width:200px', onKeyup: e => e.key === 'Enter' && pager.search() }, () => null),
        El('Select', { modelValue: state.query.status, 'onUpdate:modelValue': v => { state.query.status = v; pager.search(); }, placeholder: '状态', clearable: true, style: 'width:118px' },
          () => Object.keys(JOB_STATUS).map(k => El('Option', { key: k, label: JOB_STATUS[k], value: Number(k) }))),
        Primary('查询', pager.search),
        Btn(moreFilter.value ? '收起筛选' : '更多筛选', { onClick: () => moreFilter.value = !moreFilter.value }),
        moreFilter.value ? El('Select', { modelValue: state.query.categoryId, 'onUpdate:modelValue': v => { state.query.categoryId = v; pager.search(); }, placeholder: '职位类别', clearable: true, style: 'width:132px' },
          () => cats.value.map(c => El('Option', { key: c.id, label: c.name, value: c.id }))) : null,
        moreFilter.value ? El('Select', { modelValue: state.query.city, 'onUpdate:modelValue': v => { state.query.city = v; pager.search(); }, placeholder: '城市', clearable: true, style: 'width:110px' },
          () => CITY_OPTIONS.map(c => El('Option', { key: c, label: c, value: c }))) : null,
        h('div', { class: 'grow' }),
        Primary('+ 发布职位', openAdd)
      ]),
      El('Table', { data: state.list, loading: state.loading, stripe: true, size: 'default' }, () => [
        El('TableColumn', { label: '职位 / 要求', minWidth: 240 }, (scope) => h('div', [
          h('div', { style: 'font-weight:600' }, scope.row.title),
          h('div', { class: 'muted' }, scope.row.categoryName + ' · ' + scope.row.eduReq + ' · ' + scope.row.expReq)
        ])),
        El('TableColumn', { label: '部门 / 城市', width: 150 }, (scope) => h('div', [
          h('div', {}, scope.row.deptName || '—'),
          h('div', { class: 'muted' }, scope.row.city)
        ])),
        El('TableColumn', { label: '薪资', width: 105 }, (scope) => Span(fmtMoney(scope.row), 'color:#ef4444;font-weight:600')),
        El('TableColumn', { label: '状态', width: 88 }, (scope) => h(JobStatusTag, { status: scope.row.status })),
        El('TableColumn', { label: '浏览/投递', width: 96, align: 'right' }, (scope) => Span(scope.row.views + ' / ' + scope.row.applyCount, 'font-size:12.5px')),
        El('TableColumn', { label: '操作', width: 150, fixed: 'right' }, (scope) => {
          const r = scope.row;
          /* 主操作直接点，低频操作收进"更多"，减少视觉噪音 */
          const more = [
            { label: '查看详情', onClick: () => openDetail(r) },
            hasPerm('job:edit') ? { label: '编辑职位', onClick: () => openEdit(r) } : null,
            hasPerm('job:shelf') && r.status === 1 ? { label: '关闭职位', type: 'danger', onClick: () => shelf(r, 3) } : null,
            hasPerm('job:edit') && r.status === 0 ? { label: '删除职位', type: 'danger', onClick: () => remove(r) } : null
          ].filter(Boolean);
          return h('div', { style: 'display:flex;gap:6px;align-items:center' }, [
            hasPerm('job:shelf') ? El('Button', {
              size: 'small', type: r.status === 1 ? 'warning' : 'success', plain: true,
              onClick: () => shelf(r, r.status === 1 ? 2 : 1)
            }, () => (r.status === 1 ? '下线' : '发布')) : null,
            El('Dropdown', {
              trigger: 'click',
              onCommand: (cmd) => { const f = more.find(x => x.label === cmd); if (f) f.onClick(); }
            }, {
              default: () => El('Button', { size: 'small' }, () => '更多'),
              dropdown: () => El('DropdownMenu', null, () => more.map(x =>
                El('DropdownItem', { key: x.label, command: x.label, style: x.type === 'danger' ? 'color:#ef4444' : '' }, () => x.label)))
            })
          ]);
        })
      ]),
      h(Pager, { total: state.total, page: state.page, size: state.size, onChange: pager.onPage }),

      /* 新增 / 编辑对话框 */
      dialog.value ? El('Dialog', { modelValue: true, 'onUpdate:modelValue': v => dialog.value = v, title: form.id ? '编辑职位' : '发布新职位', width: '720px', top: '5vh' }, {
        default: () => [
        El('Form', { model: form, labelWidth: '84px' }, () => [
          h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:0 18px' }, [
            El('FormItem', { label: '职位名称', required: true }, () => El('Input', { modelValue: form.title, 'onUpdate:modelValue': v => form.title = v, placeholder: '如：高级Java开发工程师' })),
            El('FormItem', { label: '职位类别', required: true }, () => El('Select', { modelValue: form.categoryId, 'onUpdate:modelValue': v => form.categoryId = v, placeholder: '请选择', style: 'width:100%' },
              () => cats.value.map(c => El('Option', { key: c.id, label: c.name, value: c.id })))),
            El('FormItem', { label: '所属部门' }, () => El('Select', { modelValue: form.deptId, 'onUpdate:modelValue': v => form.deptId = v, placeholder: '请选择', style: 'width:100%', filterable: true },
              () => depts.value.map(d => El('Option', { key: d.id, label: d.name, value: d.id })))),
            El('FormItem', { label: '工作性质' }, () => El('Select', { modelValue: form.jobType, 'onUpdate:modelValue': v => form.jobType = v, style: 'width:100%' },
              () => Object.keys(JOB_TYPE).map(k => El('Option', { key: k, label: JOB_TYPE[k], value: Number(k) })))),
            El('FormItem', { label: '工作城市' }, () => El('Select', { modelValue: form.city, 'onUpdate:modelValue': v => form.city = v, style: 'width:100%', filterable: true, allowCreate: true },
              () => CITY_OPTIONS.map(c => El('Option', { key: c, label: c, value: c })))),
            El('FormItem', { label: '招聘人数' }, () => El('InputNumber', { modelValue: form.headcount, 'onUpdate:modelValue': v => form.headcount = v, min: 1, style: 'width:100%' })),
            El('FormItem', { label: '薪资范围(K)' }, () => h('div', { style: 'display:flex;align-items:center;gap:8px' }, [
              El('InputNumber', { modelValue: form.salaryMin, 'onUpdate:modelValue': v => form.salaryMin = v, min: 1, style: 'flex:1' }),
              h('span', '—'),
              El('InputNumber', { modelValue: form.salaryMax, 'onUpdate:modelValue': v => form.salaryMax = v, min: 1, style: 'flex:1' })
            ])),
            El('FormItem', { label: '学历要求' }, () => El('Select', { modelValue: form.eduReq, 'onUpdate:modelValue': v => form.eduReq = v, style: 'width:100%' },
              () => EDU_OPTIONS.map(c => El('Option', { key: c, label: c, value: c })))),
            El('FormItem', { label: '经验要求' }, () => El('Select', { modelValue: form.expReq, 'onUpdate:modelValue': v => form.expReq = v, style: 'width:100%' },
              () => EXP_OPTIONS.map(c => El('Option', { key: c, label: c, value: c })))),
            El('FormItem', { label: '投递截止' }, () => El('DatePicker', { modelValue: form.deadline, 'onUpdate:modelValue': v => form.deadline = v, type: 'date', valueFormat: 'YYYY-MM-DD', style: 'width:100%' }))
          ]),
          El('FormItem', { label: '技能标签' }, () => El('Select', { modelValue: form.tags, 'onUpdate:modelValue': v => form.tags = v, multiple: true, filterable: true, allowCreate: true, defaultFirst: true, placeholder: '输入后回车创建标签', style: 'width:100%' },
            () => (form.tags || []).map(t => El('Option', { key: t, label: t, value: t })))),
          El('FormItem', { label: '职位描述' }, () => El('Input', { modelValue: form.description, 'onUpdate:modelValue': v => form.description = v, type: 'textarea', rows: 3, placeholder: '岗位职责，每行一条' })),
          El('FormItem', { label: '任职要求' }, () => El('Input', { modelValue: form.requirement, 'onUpdate:modelValue': v => form.requirement = v, type: 'textarea', rows: 3, placeholder: '任职资格，每行一条' }))
        ]),
        ],
        footer: () => [
        Btn('取消', { onClick: () => dialog.value = false }),
        Btn('保存为草稿', () => { form.status = 0; save(); }, { loading: saving.value }),
        Primary(form.id ? '保存修改' : '保存并发布', () => { form.status = 1; save(); }, { loading: saving.value })
        ]
      }) : null,

      /* 详情抽屉 */
      detailVisible.value && detail.value ? El('Drawer', { modelValue: true, 'onUpdate:modelValue': v => detailVisible.value = v, title: '职位详情', size: '560px' }, () => [
        h('h2', { style: 'margin:0 0 6px' }, detail.value.title),
        h('div', { style: 'color:#ef4444;font-weight:600;font-size:17px;margin-bottom:10px' }, fmtMoney(detail.value)),
        h('div', { class: 'tag-line', style: 'margin-bottom:14px' }, [
          h(JobStatusTag, { status: detail.value.status }),
          El('Tag', { size: 'small', type: 'info' }, () => detail.value.city),
          El('Tag', { size: 'small', type: 'info' }, () => JOB_TYPE[detail.value.jobType]),
          El('Tag', { size: 'small', type: 'info' }, () => detail.value.eduReq),
          El('Tag', { size: 'small', type: 'info' }, () => detail.value.expReq),
          El('Tag', { size: 'small', type: 'info' }, () => '招 ' + detail.value.headcount + ' 人')
        ]),
        El('Descriptions', { column: 2, border: true, size: 'small' }, () => [
          El('DescriptionsItem', { label: '职位类别' }, () => detail.value.categoryName || '—'),
          El('DescriptionsItem', { label: '所属部门' }, () => detail.value.deptName || '—'),
          El('DescriptionsItem', { label: '发布时间' }, () => detail.value.publishTime || '未发布'),
          El('DescriptionsItem', { label: '截止日期' }, () => detail.value.deadline || '—'),
          El('DescriptionsItem', { label: '浏览量' }, () => String(detail.value.views)),
          El('DescriptionsItem', { label: '投递量' }, () => String(detail.value.applyCount || detail.value.applies || 0))
        ]),
        h('h4', '职位描述'), h('div', { class: 'jdesc' }, detail.value.description || '—'),
        h('h4', '任职要求'), h('div', { class: 'jdesc' }, detail.value.requirement || '—')
      ]) : null
    ]);
  }
};

/* =====================================================================
 * 2. 职位类别管理
 * ===================================================================== */
const PageJobCategory = {
  setup() {
    const list = Vue.ref([]);
    const loading = Vue.ref(false);
    const dialog = Vue.ref(false);
    const form = Vue.reactive({ id: null, name: '', sort: 10, status: 1 });
    async function load() {
      loading.value = true;
      try {
        const r = await http.get('/job/categories');
        if (r.code === 200) list.value = r.data;
      } finally { loading.value = false; }
    }
    Vue.onMounted(load);
    function openAdd() { Object.assign(form, { id: null, name: '', sort: list.value.length + 1, status: 1 }); dialog.value = true; }
    function openEdit(row) { Object.assign(form, row); dialog.value = true; }
    async function save() {
      if (!form.name) { ElementPlus.ElMessage.warning('请填写类别名称'); return; }
      const r = form.id ? await http.put('/job/categories/' + form.id, form) : await http.post('/job/categories', form);
      if (r.code !== 200) { ElementPlus.ElMessage.error(r.message); return; }
      ElementPlus.ElMessage.success(r.message); dialog.value = false; load();
    }
    function remove(row) {
      ElementPlus.ElMessageBox.confirm('确认删除类别「' + row.name + '」？', '提示', { type: 'warning' }).then(async () => {
        const r = await http.del('/job/categories/' + row.id);
        if (r.code !== 200) { ElementPlus.ElMessage.error(r.message); return; }
        ElementPlus.ElMessage.success('删除成功'); load();
      }).catch(() => { });
    }
    return () => Card('职位类别', [
      h('div', { class: 'toolbar' }, [
        h('div', { class: 'muted' }, '类别用于职位归类与门户筛选；类别下存在职位时不可删除。'),
        h('div', { class: 'grow' }),
        Primary('+ 新增类别', openAdd)
      ]),
      El('Table', { data: list.value, loading: loading.value, stripe: true }, () => [
        El('TableColumn', { prop: 'name', label: '类别名称', minWidth: 180 }),
        El('TableColumn', { prop: 'sort', label: '排序', width: 90 }),
        El('TableColumn', { label: '状态', width: 100 }, (s) => El('Tag', { type: s.row.status === 1 ? 'success' : 'info', size: 'small' }, () => s.row.status === 1 ? '启用' : '停用')),
        El('TableColumn', { label: '在招职位数', width: 120 }, (s) => String(DB.jobs.filter(j => j.categoryId === s.row.id).length)),
        El('TableColumn', { label: '操作', width: 130 }, (s) => Ops([
          { label: '编辑', onClick: () => openEdit(s.row) },
          { label: '删除', type: 'danger', onClick: () => remove(s.row) }
        ]))
      ]),
      dialog.value ? El('Dialog', { modelValue: true, 'onUpdate:modelValue': v => dialog.value = v, title: form.id ? '编辑类别' : '新增类别', width: '440px' }, {
        default: () => [
        El('Form', { model: form, labelWidth: '80px' }, () => [
          El('FormItem', { label: '类别名称', required: true }, () => El('Input', { modelValue: form.name, 'onUpdate:modelValue': v => form.name = v })),
          El('FormItem', { label: '排序' }, () => El('InputNumber', { modelValue: form.sort, 'onUpdate:modelValue': v => form.sort = v, min: 1, style: 'width:100%' })),
          El('FormItem', { label: '状态' }, () => El('Switch', { modelValue: form.status, 'onUpdate:modelValue': v => form.status = v ? 1 : 0, activeText: '启用', inactiveText: '停用' }))
        ]),
        ],
        footer: () => [
        Btn('取消', { onClick: () => dialog.value = false }),
        Primary('保存', save)
        ]
      }) : null
    ]);
  }
};

/* =====================================================================
 * 3. 简历投递与上传（迭代3）
 * ===================================================================== */
const PageResumeList = {
  setup() {
    const pager = usePager((p) => http.get('/applications', p), { keyword: '', status: '', jobId: '', source: '', education: '' });
    const { state } = pager;
    const jobs = Vue.ref([]);
    const parseVisible = Vue.ref(false);

    Vue.onMounted(async () => {
      const r = await http.get('/jobs', { pageSize: 100 });
      if (r.code === 200) jobs.value = r.data.list;
      pager.load();
    });
    async function onParsed(data) {
      const r = await http.post('/applications', Object.assign({ jobId: state.query.jobId || (jobs.value[0] || {}).id, source: '招聘网站' }, data));
      if (r.code !== 200) { ElementPlus.ElMessage.error(r.message); return; }
      ElementPlus.ElMessage.success('简历已入库并投递至「' + r.data.jobTitle + '」');
      pager.load();
    }
    function parseOnly(data) {
      /* 只入候选人库：挂到"人才储备"职位之外，用第一条在招职位 ID 便于演示 */
      onParsed(data);
    }
    function download(row) {
      ElementPlus.ElMessageBox.alert('简历文件：' + row.resumeName + '<br/><span style="color:#94a3b8">（演示环境不提供真实文件下载，接口见《接口文档.md》3.6 节 GET /files/resume/{id}）</span>', '简历预览', { dangerouslyUseHTMLString: true });
    }
    return () => h(Vue.Fragment, null, [
      Card('简历投递记录', [
        h('div', { class: 'toolbar' }, [
          El('Input', { modelValue: state.query.keyword, 'onUpdate:modelValue': v => state.query.keyword = v, placeholder: '搜索姓名 / 手机号 / 院校', clearable: true, style: 'width:210px', onKeyup: e => e.key === 'Enter' && pager.search() }, () => null),
          El('Select', { modelValue: state.query.status, 'onUpdate:modelValue': v => { state.query.status = v; pager.search(); }, placeholder: '投递状态', clearable: true, style: 'width:128px' },
            () => Object.keys(APP_STATUS).map(k => El('Option', { key: k, label: APP_STATUS[k], value: Number(k) }))),
          El('Select', { modelValue: state.query.jobId, 'onUpdate:modelValue': v => { state.query.jobId = v; pager.search(); }, placeholder: '应聘职位', clearable: true, style: 'width:180px' },
            () => jobs.value.map(j => El('Option', { key: j.id, label: j.title, value: j.id }))),
          Primary('查询', pager.search),
          h('div', { class: 'grow' }),
          Primary('上传简历', () => parseVisible.value = true)
        ]),
        El('Table', { data: state.list, loading: state.loading, stripe: true }, () => [
          El('TableColumn', { label: '候选人', minWidth: 150 }, (s) => h('div', [
            h('div', { style: 'font-weight:600' }, s.row.candidateName),
            h('div', { class: 'muted' }, (s.row.gender === 1 ? '男' : '女') + ' · ' + s.row.age + '岁 · ' + s.row.phone)
          ])),
          El('TableColumn', { label: '应聘职位', minWidth: 160, showOverflowTooltip: true }, (s) => h('div', [
            h('div', {}, s.row.jobTitle),
            h('div', { class: 'muted' }, s.row.source + (s.row.parsed ? ' · 已解析' : ' · 未解析'))
          ])),
          El('TableColumn', { label: '学历 / 院校', minWidth: 150, showOverflowTooltip: true }, (s) => h('div', [
            h('div', {}, s.row.education),
            h('div', { class: 'muted' }, s.row.school)
          ])),
          El('TableColumn', { label: '状态', width: 106 }, (s) => h(AppStatusTag, { status: s.row.status })),
          El('TableColumn', { label: '投递时间', width: 106 }, (s) => Span((s.row.applyTime || '').slice(0, 10), 'font-size:12.5px')),
          El('TableColumn', { label: '操作', width: 118, fixed: 'right' }, (s) => Ops([
            { label: '简历', onClick: () => download(s.row) },
            { label: '跟进', onClick: () => go('/flow?keyword=' + encodeURIComponent(s.row.candidateName)) }
          ]))
        ]),
        h(Pager, { total: state.total, page: state.page, size: state.size, onChange: pager.onPage })
      ]),
      h(ResumeParseDialog, { modelValue: parseVisible.value, 'onUpdate:modelValue': v => parseVisible.value = v, onParsed: parseOnly })
    ]);
  }
};

/* =====================================================================
 * 4. 候选人库与标签
 * ===================================================================== */
const PageCandidateList = {
  setup() {
    const pager = usePager((p) => http.get('/applications', p), { keyword: '', status: '', tagId: '', education: '' });
    const { state } = pager;
    const tags = Vue.ref([]);
    const detail = Vue.ref(null);
    const detailVisible = Vue.ref(false);
    const tagVisible = Vue.ref(false);
    const tagTarget = Vue.ref(null);
    const tagPicked = Vue.ref([]);

    Vue.onMounted(async () => {
      const r = await http.get('/tags');
      if (r.code === 200) tags.value = r.data;
      pager.load();
    });
    async function openDetail(row) {
      const r = await http.get('/applications/' + row.id);
      if (r.code !== 200) { ElementPlus.ElMessage.error(r.message); return; }
      detail.value = r.data; detailVisible.value = true;
    }
    function openTag(row) { tagTarget.value = row; tagPicked.value = row.tagIds.slice(); tagVisible.value = true; }
    async function saveTags() {
      const r = await http.put('/candidates/' + tagTarget.value.id + '/tags', { tagIds: tagPicked.value });
      if (r.code !== 200) { ElementPlus.ElMessage.error(r.message); return; }
      ElementPlus.ElMessage.success('标签已更新'); tagVisible.value = false; pager.load();
    }
    return () => h(Vue.Fragment, null, [
      Card('候选人库', [
        h('div', { class: 'toolbar' }, [
          El('Input', { modelValue: state.query.keyword, 'onUpdate:modelValue': v => state.query.keyword = v, placeholder: '搜索姓名 / 手机号 / 院校', clearable: true, style: 'width:210px', onKeyup: e => e.key === 'Enter' && pager.search() }, () => null),
          El('Select', { modelValue: state.query.status, 'onUpdate:modelValue': v => { state.query.status = v; pager.search(); }, placeholder: '当前状态', clearable: true, style: 'width:128px' },
            () => Object.keys(APP_STATUS).map(k => El('Option', { key: k, label: APP_STATUS[k], value: Number(k) }))),
          El('Select', { modelValue: state.query.tagId, 'onUpdate:modelValue': v => { state.query.tagId = v; pager.search(); }, placeholder: '标签', clearable: true, style: 'width:118px' },
            () => tags.value.map(t => El('Option', { key: t.id, label: t.name, value: t.id }))),
          El('Select', { modelValue: state.query.education, 'onUpdate:modelValue': v => { state.query.education = v; pager.search(); }, placeholder: '学历', clearable: true, style: 'width:104px' },
            () => EDU_OPTIONS.map(e => El('Option', { key: e, label: e, value: e }))),
          Primary('查询', pager.search),
          h('div', { class: 'grow' }),
          Btn('标签管理', { onClick: () => go('/tags') })
        ]),
        El('Table', { data: state.list, loading: state.loading, stripe: true }, () => [
          El('TableColumn', { label: '候选人', minWidth: 150 }, (s) => h('div', [
            h('div', { style: 'font-weight:600' }, s.row.candidateName),
            h('div', { class: 'muted' }, s.row.workYears + ' · ' + (s.row.latestCompany || '—'))
          ])),
          El('TableColumn', { label: '学历 / 院校', minWidth: 150, showOverflowTooltip: true }, (s) => h('div', [
            h('div', {}, s.row.education),
            h('div', { class: 'muted' }, s.row.school)
          ])),
          El('TableColumn', { label: '技能', minWidth: 165 }, (s) => h('div', { class: 'tag-line' }, (s.row.skills || []).map(k => El('Tag', { key: k, size: 'small', type: 'info' }, () => k)))),
          El('TableColumn', { label: '期望薪资', width: 108 }, (s) => s.row.expectSalary),
          El('TableColumn', { label: '状态', width: 106 }, (s) => h('div', [
            h(AppStatusTag, { status: s.row.status }),
            s.row.score ? h('div', { class: 'muted', style: 'margin-top:2px' }, s.row.score + ' 分') : null
          ])),
          El('TableColumn', { label: '标签', minWidth: 130 }, (s) => h('div', { class: 'tag-line' }, (s.row.tagList || []).length
            ? s.row.tagList.map(t => El('Tag', { key: t.id, size: 'small', color: t.color, effect: 'dark', style: 'border:none' }, () => t.name))
            : [Span('—', 'color:#c0c4cc;font-size:12.5px')])),
          El('TableColumn', { label: '操作', width: 116, fixed: 'right' }, (s) => Ops([
            { label: '详情', onClick: () => openDetail(s.row) },
            { label: '标签', onClick: () => openTag(s.row) }
          ]))
        ]),
        h(Pager, { total: state.total, page: state.page, size: state.size, onChange: pager.onPage })
      ]),

      /* 候选人详情 */
      detailVisible.value && detail.value ? El('Drawer', { modelValue: true, 'onUpdate:modelValue': v => detailVisible.value = v, title: '候选人详情', size: '600px' }, () => [
        h('h2', { style: 'margin:0 0 8px' }, detail.value.candidateName + '　' + Span((detail.value.gender === 1 ? '男' : '女') + ' · ' + detail.value.age + '岁', 'font-size:13px;color:#94a3b8;font-weight:400')),
        h('div', { style: 'margin-bottom:12px' }, [h(AppStatusTag, { status: detail.value.status }), Span('　应聘：' + detail.value.jobTitle, 'font-size:13px')]),
        El('Descriptions', { column: 2, border: true, size: 'small' }, () => [
          El('DescriptionsItem', { label: '手机号' }, () => detail.value.phone),
          El('DescriptionsItem', { label: '邮箱' }, () => detail.value.email),
          El('DescriptionsItem', { label: '学历' }, () => detail.value.education),
          El('DescriptionsItem', { label: '毕业院校' }, () => detail.value.school),
          El('DescriptionsItem', { label: '专业' }, () => detail.value.major),
          El('DescriptionsItem', { label: '工作年限' }, () => detail.value.workYears),
          El('DescriptionsItem', { label: '最近公司' }, () => detail.value.latestCompany || '—'),
          El('DescriptionsItem', { label: '期望薪资' }, () => detail.value.expectSalary),
          El('DescriptionsItem', { label: '简历来源' }, () => detail.value.source),
          El('DescriptionsItem', { label: '简历文件' }, () => detail.value.resumeName),
          El('DescriptionsItem', { label: '自我评价', span: 2 }, () => detail.value.selfEval)
        ]),
        h('h4', '技能标签'), h('div', { class: 'tag-line' }, (detail.value.skills || []).map(k => El('Tag', { key: k, size: 'small' }, () => k))),
        h('h4', '面试记录'), (detail.value.interviews || []).length ? El('Table', { data: detail.value.interviews, size: 'small' }, () => [
          El('TableColumn', { prop: 'round', label: '轮次', width: 60 }),
          El('TableColumn', { prop: 'interviewTime', label: '时间', width: 150 }),
          El('TableColumn', { prop: 'interviewerName', label: '面试官', width: 90 }),
          El('TableColumn', { label: '结果', width: 80 }, (s) => El('Tag', { size: 'small', type: s.row.result === 1 ? 'success' : s.row.result === 2 ? 'danger' : 'info' }, () => s.row.result === 1 ? '通过' : s.row.result === 2 ? '未通过' : '待面试')),
          El('TableColumn', { prop: 'comment', label: '评价', minWidth: 150 })
        ]) : Span('暂无面试记录', 'color:#c0c4cc;font-size:13px'),
        h('h4', '状态流转轨迹'), El('Timeline', null, () => (detail.value.flowLogs || []).map(f =>
          El('TimelineItem', { key: f.id, timestamp: f.createTime, placement: 'top' }, () => h('div', [
            h('b', {}, f.operator + '：'), Span(f.fromName + ' → ' + f.toName, 'color:#2f6fed')
          ]))
        ))
      ]) : null,

      /* 标签编辑 */
      tagVisible.value ? El('Dialog', { modelValue: true, 'onUpdate:modelValue': v => tagVisible.value = v, title: '为「' + tagTarget.value.candidateName + '」设置标签', width: '440px' }, {
        default: () => [
        El('CheckboxGroup', { modelValue: tagPicked.value, 'onUpdate:modelValue': v => tagPicked.value = v }, () =>
          tags.value.map(t => El('Checkbox', { key: t.id, label: t.id, style: 'display:block;margin:8px 0' }, () =>
            h('span', null, [El('Tag', { size: 'small', color: t.color, effect: 'dark', style: 'border:none' }, () => t.name)])))),
        ],
        footer: () => [
        Btn('取消', { onClick: () => tagVisible.value = false }),
        Primary('保存', saveTags)
        ]
      }) : null
    ]);
  }
};

/* =====================================================================
 * 5. 招聘流程：简历筛选与状态流转（迭代4）
 * ===================================================================== */
const PageFlow = {
  setup() {
    const keyword = (location.hash.split('?keyword=')[1] || '');
    const pager = usePager((p) => http.get('/applications', p), { keyword: decodeURIComponent(keyword), status: '', jobId: '', source: '' });
    const { state } = pager;
    const jobs = Vue.ref([]);
    const selection = Vue.ref([]);
    const flowVisible = Vue.ref(false);
    const flowTarget = Vue.ref(null);
    const flowForm = Vue.reactive({ toStatus: null, remark: '' });
    const batchForm = Vue.reactive({ toStatus: null, remark: '' });
    const batchVisible = Vue.ref(false);

    Vue.onMounted(async () => {
      const r = await http.get('/jobs', { pageSize: 100 });
      if (r.code === 200) jobs.value = r.data.list;
      pager.load();
    });
    /* 行内主操作已确定目标状态时直接带入，弹窗只需确认（或补充原因） */
    function openFlow(row, preset) { flowTarget.value = row; flowForm.toStatus = preset || null; flowForm.remark = ''; flowVisible.value = true; }
    async function submitFlow() {
      if (!flowForm.toStatus) { ElementPlus.ElMessage.warning('请选择要流转到的状态'); return; }
      if (flowForm.toStatus === 3 && !flowForm.remark) { ElementPlus.ElMessage.warning('淘汰候选人时请填写原因'); return; }
      const r = await http.post('/applications/' + flowTarget.value.id + '/flow', flowForm);
      if (r.code !== 200) { ElementPlus.ElMessage.error(r.message); return; }
      ElementPlus.ElMessage.success('已流转为「' + r.data.statusName + '」');
      flowVisible.value = false; pager.load();
    }
    async function submitBatch() {
      if (!batchForm.toStatus) { ElementPlus.ElMessage.warning('请选择目标状态'); return; }
      const r = await http.post('/applications/batch-flow', {
        ids: selection.value.map(x => x.id), toStatus: batchForm.toStatus, remark: batchForm.remark
      });
      if (r.code !== 200) { ElementPlus.ElMessage.error(r.message); return; }
      const fail = r.data.results.filter(x => !x.success);
      if (fail.length) {
        ElementPlus.ElMessageBox.alert('成功 ' + r.data.success + ' 条，失败 ' + r.data.fail + ' 条：<br/>' +
          fail.slice(0, 8).map(f => '· 记录#' + f.id + '：' + f.message).join('<br/>'), '批量流转结果', { dangerouslyUseHTMLString: true });
      } else ElementPlus.ElMessage.success('批量流转成功 ' + r.data.success + ' 条');
      batchVisible.value = false; pager.load();
    }
    const flowSteps = (status) => FUNNEL_STAGES.map(s => ({
      name: s.name, cls: status > s.status ? 'done' : (status === s.status ? 'now' : '')
    }));
    return () => h(Vue.Fragment, null, [
      Card('简历筛选与状态流转', [
        h('div', { class: 'toolbar' }, [
          El('Input', { modelValue: state.query.keyword, 'onUpdate:modelValue': v => state.query.keyword = v, placeholder: '搜索候选人 / 手机号', clearable: true, style: 'width:210px', onKeyup: e => e.key === 'Enter' && pager.search() }, () => null),
          El('Select', { modelValue: state.query.status, 'onUpdate:modelValue': v => { state.query.status = v; pager.search(); }, placeholder: '状态', clearable: true, style: 'width:124px' },
            () => Object.keys(APP_STATUS).map(k => El('Option', { key: k, label: APP_STATUS[k], value: Number(k) }))),
          El('Select', { modelValue: state.query.jobId, 'onUpdate:modelValue': v => { state.query.jobId = v; pager.search(); }, placeholder: '应聘职位', clearable: true, style: 'width:180px' },
            () => jobs.value.map(j => El('Option', { key: j.id, label: j.title, value: j.id }))),
          Primary('查询', pager.search),
          h('div', { class: 'grow' }),
          Btn('批量流转', {
            disabled: !selection.value.length,
            onClick: () => { if (!selection.value.length) { ElementPlus.ElMessage.warning('请先勾选候选人'); return; } batchForm.toStatus = null; batchForm.remark = ''; batchVisible.value = true; }
          }, { type: selection.value.length ? 'primary' : 'default' })
        ]),
        El('Table', { data: state.list, loading: state.loading, stripe: true, onSelectionChange: v => selection.value = v }, () => [
          El('TableColumn', { type: 'selection', width: 44 }),
          El('TableColumn', { label: '候选人', minWidth: 130 }, (s) => h('div', [
            h('div', { style: 'font-weight:600' }, s.row.candidateName),
            h('div', { class: 'muted' }, s.row.education + ' · ' + s.row.workYears)
          ])),
          El('TableColumn', { label: '应聘职位', minWidth: 160, showOverflowTooltip: true }, (s) => h('div', [
            h('div', {}, s.row.jobTitle),
            h('div', { class: 'muted' }, s.row.source + ' · ' + (s.row.applyTime || '').slice(0, 10))
          ])),
          El('TableColumn', { label: '状态', width: 104 }, (s) => h('div', [
            h(AppStatusTag, { status: s.row.status }),
            s.row.screenRemark ? h('div', { class: 'muted', style: 'margin-top:2px', title: s.row.screenRemark }, s.row.screenRemark.slice(0, 10)) : null
          ])),
          El('TableColumn', { label: '流程进度', minWidth: 250 }, (s) => h('div', { class: 'flow-steps' },
            flowSteps(s.row.status).map((f, i) => h(Vue.Fragment, { key: i }, [
              h('span', { class: 's ' + f.cls }, f.name),
              i < 4 ? h('span', { style: 'color:#cbd5e1' }, '›') : null
            ])))),
          El('TableColumn', { label: '操作', width: 150, fixed: 'right' }, (s) => {
            const nexts = FLOW[s.row.status] || [];
            if (!nexts.length) return Span('流程已结束', 'color:#c0c4cc;font-size:12.5px');
            /* 主推下一步直接点，淘汰等分支收进下拉 */
            const main = nexts.find(n => n.to !== 3) || nexts[0];
            const others = nexts.filter(n => n !== main);
            return h('div', { style: 'display:flex;gap:6px;align-items:center' }, [
              El('Button', {
                size: 'small', plain: true,
                type: main.to === 3 ? 'danger' : (main.to === 2 || main.to === 6 || main.to === 8 ? 'success' : 'primary'),
                onClick: () => openFlow(s.row, main.to)
              }, () => main.label),
              others.length ? El('Dropdown', {
                trigger: 'click',
                onCommand: (cmd) => openFlow(s.row, Number(cmd))
              }, {
                default: () => El('Button', { size: 'small' }, () => '其他'),
                dropdown: () => El('DropdownMenu', null, () => others.map(n =>
                  El('DropdownItem', { key: n.to, command: String(n.to), style: n.to === 3 ? 'color:#ef4444' : '' }, () => n.label)))
              }) : null
            ]);
          })
        ]),
        h(Pager, { total: state.total, page: state.page, size: state.size, onChange: pager.onPage })
      ]),

      /* 单条流转 */
      flowVisible.value ? El('Dialog', { modelValue: true, 'onUpdate:modelValue': v => flowVisible.value = v, title: '候选人状态流转', width: '520px' }, {
        default: () => [
        El('Descriptions', { column: 2, border: true, size: 'small', style: 'margin-bottom:14px' }, () => [
          El('DescriptionsItem', { label: '候选人' }, () => flowTarget.value.candidateName),
          El('DescriptionsItem', { label: '应聘职位' }, () => flowTarget.value.jobTitle),
          El('DescriptionsItem', { label: '当前状态' }, () => APP_STATUS[flowTarget.value.status]),
          El('DescriptionsItem', { label: '简历来源' }, () => flowTarget.value.source)
        ]),
        El('Form', { model: flowForm, labelWidth: '90px' }, () => [
          El('FormItem', { label: '目标状态', required: true }, () => El('RadioGroup', { modelValue: flowForm.toStatus, 'onUpdate:modelValue': v => flowForm.toStatus = v },
            () => (FLOW[flowTarget.value.status] || []).map(n => El('Radio', { key: n.to, label: n.to, style: 'margin-right:16px' }, () => n.label)))),
          El('FormItem', { label: '备注/原因' }, () => El('Input', { modelValue: flowForm.remark, 'onUpdate:modelValue': v => flowForm.remark = v, type: 'textarea', rows: 3, placeholder: '淘汰或特殊处理时请说明原因，将记入操作日志' }))
        ]),
        ],
        footer: () => [
        Btn('取消', { onClick: () => flowVisible.value = false }),
        Primary('确认流转', submitFlow)
        ]
      }) : null,

      /* 批量流转 */
      batchVisible.value ? El('Dialog', { modelValue: true, 'onUpdate:modelValue': v => batchVisible.value = v, title: '批量状态流转', width: '480px' }, {
        default: () => [
        h('div', { class: 'note' }, '已勾选 ' + selection.value.length + ' 位候选人，不符合规则的单条会在结果中列出。'),
        El('Form', { model: batchForm, labelWidth: '90px' }, () => [
          El('FormItem', { label: '目标状态', required: true }, () => El('Select', { modelValue: batchForm.toStatus, 'onUpdate:modelValue': v => batchForm.toStatus = v, placeholder: '请选择', style: 'width:100%' },
            () => Object.keys(APP_STATUS).map(k => El('Option', { key: k, label: APP_STATUS[k], value: Number(k) })))),
          El('FormItem', { label: '统一备注' }, () => El('Input', { modelValue: batchForm.remark, 'onUpdate:modelValue': v => batchForm.remark = v, type: 'textarea', rows: 3 }))
        ]),
        ],
        footer: () => [
        Btn('取消', { onClick: () => batchVisible.value = false }),
        Primary('确认批量流转', submitBatch)
        ]
      }) : null
    ]);
  }
};

/* =====================================================================
 * 6. 面试安排与通知
 * ===================================================================== */
const PageInterview = {
  setup() {
    const pager = usePager((p) => http.get('/interviews', p), { keyword: '', result: '', date: '' });
    const { state } = pager;
    const dialog = Vue.ref(false);
    const form = Vue.reactive({});
    const candidates = Vue.ref([]);
    const evalVisible = Vue.ref(false);
    const evalTarget = Vue.ref(null);
    const evalForm = Vue.reactive({ result: 1, score: 80, comment: '' });

    Vue.onMounted(async () => {
      const r = await http.get('/applications', { pageSize: 200, status: '' });
      if (r.code === 200) candidates.value = r.data.list.filter(a => [2, 4, 5].includes(a.status));
      pager.load();
    });
    function openAdd() {
      Object.assign(form, {
        id: null, applicationId: null, interviewTime: daysLater(1) + ' 10:00', duration: 60, method: 1,
        address: '总部A座12楼会议室3', interviewerId: 4, interviewerName: '李维', notifyChannel: '短信+邮件'
      });
      dialog.value = true;
    }
    async function save() {
      if (!form.applicationId) { ElementPlus.ElMessage.warning('请选择候选人'); return; }
      const r = await http.post('/interviews', form);
      if (r.code !== 200) { ElementPlus.ElMessage.error(r.message); return; }
      ElementPlus.ElMessage.success(r.message); dialog.value = false; pager.load();
    }
    function openEval(row) {
      evalTarget.value = row;
      evalForm.result = row.result || 1; evalForm.score = row.score || 80; evalForm.comment = row.comment || '';
      evalVisible.value = true;
    }
    async function saveEval() {
      const r = await http.put('/interviews/' + evalTarget.value.id, evalForm);
      if (r.code !== 200) { ElementPlus.ElMessage.error(r.message); return; }
      ElementPlus.ElMessage.success('评价已提交');
      evalVisible.value = false; pager.load();
    }
    async function notify(row) {
      const r = await http.post('/interviews/' + row.id + '/notify', { channel: row.notifyChannel });
      if (r.code !== 200) { ElementPlus.ElMessage.error(r.message); return; }
      ElementPlus.ElMessage.success(r.message);
      pager.load();
    }
    return () => h(Vue.Fragment, null, [
      Card('面试安排', [
        h('div', { class: 'toolbar' }, [
          El('Input', { modelValue: state.query.keyword, 'onUpdate:modelValue': v => state.query.keyword = v, placeholder: '搜索候选人 / 职位 / 面试官', clearable: true, style: 'width:220px', onKeyup: e => e.key === 'Enter' && pager.search() }, () => null),
          El('Select', { modelValue: state.query.result, 'onUpdate:modelValue': v => { state.query.result = v; pager.search(); }, placeholder: '面试结果', clearable: true, style: 'width:122px' }, () =>
            [{ v: 0, l: '待面试' }, { v: 1, l: '通过' }, { v: 2, l: '未通过' }].map(o => El('Option', { key: o.v, label: o.l, value: o.v }))),
          El('DatePicker', { modelValue: state.query.date, 'onUpdate:modelValue': v => { state.query.date = v; pager.search(); }, type: 'date', valueFormat: 'YYYY-MM-DD', placeholder: '面试日期', style: 'width:150px' }),
          Primary('查询', pager.search),
          h('div', { class: 'grow' }),
          Primary('+ 安排面试', openAdd)
        ]),
        El('Table', { data: state.list, loading: state.loading, stripe: true }, () => [
          El('TableColumn', { label: '候选人', minWidth: 124 }, (s) => h('div', [
            h('div', { style: 'font-weight:600' }, s.row.candidateName),
            h('div', { class: 'muted' }, '第' + s.row.round + '轮 · ' + s.row.methodName)
          ])),
          El('TableColumn', { label: '应聘职位', minWidth: 160, showOverflowTooltip: true }, (s) => s.row.jobTitle),
          El('TableColumn', { label: '面试时间 / 地点', minWidth: 200, showOverflowTooltip: true }, (s) => h('div', [
            h('div', {}, s.row.interviewTime + '　' + s.row.duration + '分钟'),
            h('div', { class: 'muted' }, s.row.address)
          ])),
          El('TableColumn', { label: '面试官', width: 92 }, (s) => s.row.interviewerName),
          El('TableColumn', { label: '通知', width: 100 }, (s) => h('div', [
            El('Tag', { size: 'small', type: s.row.notifyStatus ? 'success' : 'info' }, () => s.row.notifyStatus ? '已通知' : '未通知'),
            h('div', { class: 'muted' }, s.row.notifyChannel)
          ])),
          El('TableColumn', { label: '结果', width: 96 }, (s) => h('div', [
            El('Tag', { size: 'small', type: s.row.resultType }, () => s.row.resultName),
            s.row.score ? h('div', { class: 'muted', style: 'margin-top:2px' }, s.row.score + ' 分') : null
          ])),
          El('TableColumn', { label: '操作', width: 116, fixed: 'right' }, (s) => Ops([
            { label: '评价', onClick: () => openEval(s.row) },
            { label: '再通知', onClick: () => notify(s.row) }
          ]))
        ]),
        h(Pager, { total: state.total, page: state.page, size: state.size, onChange: pager.onPage })
      ]),

      dialog.value ? El('Dialog', { modelValue: true, 'onUpdate:modelValue': v => dialog.value = v, title: '安排面试', width: '600px' }, {
        default: () => [
        El('Form', { model: form, labelWidth: '100px' }, () => [
          El('FormItem', { label: '候选人', required: true }, () => El('Select', { modelValue: form.applicationId, 'onUpdate:modelValue': v => form.applicationId = v, filterable: true, placeholder: '选择待面试的候选人', style: 'width:100%' },
            () => candidates.value.map(c => El('Option', { key: c.id, label: c.candidateName + '（' + c.jobTitle + '）', value: c.id })))),
          El('FormItem', { label: '面试时间', required: true }, () => El('DatePicker', { modelValue: form.interviewTime, 'onUpdate:modelValue': v => form.interviewTime = v, type: 'datetime', valueFormat: 'YYYY-MM-DD HH:mm', style: 'width:100%' })),
          El('FormItem', { label: '面试方式' }, () => El('RadioGroup', { modelValue: form.method, 'onUpdate:modelValue': v => form.method = v }, () => [
            El('Radio', { label: 1, style: 'margin-right:18px' }, () => '现场面试'),
            El('Radio', { label: 2 }, () => '视频面试')
          ])),
          El('FormItem', { label: '时长(分钟)' }, () => El('InputNumber', { modelValue: form.duration, 'onUpdate:modelValue': v => form.duration = v, min: 15, step: 15, style: 'width:100%' })),
          El('FormItem', { label: '地点/会议链接' }, () => El('Input', { modelValue: form.address, 'onUpdate:modelValue': v => form.address = v })),
          El('FormItem', { label: '面试官' }, () => El('Input', { modelValue: form.interviewerName, 'onUpdate:modelValue': v => form.interviewerName = v })),
          El('FormItem', { label: '通知方式' }, () => El('Select', { modelValue: form.notifyChannel, 'onUpdate:modelValue': v => form.notifyChannel = v, style: 'width:100%' },
            () => ['短信+邮件', '邮件', '短信', '电话'].map(c => El('Option', { key: c, label: c, value: c }))))
        ]),
        ],
        footer: () => [
        Btn('取消', { onClick: () => dialog.value = false }),
        Primary('安排并发送通知', save)
        ]
      }) : null,

      evalVisible.value ? El('Dialog', { modelValue: true, 'onUpdate:modelValue': v => evalVisible.value = v, title: '面试评价', width: '520px' }, {
        default: () => [
        El('Descriptions', { column: 2, border: true, size: 'small', style: 'margin-bottom:14px' }, () => [
          El('DescriptionsItem', { label: '候选人' }, () => evalTarget.value.candidateName),
          El('DescriptionsItem', { label: '应聘职位' }, () => evalTarget.value.jobTitle)
        ]),
        El('Form', { model: evalForm, labelWidth: '80px' }, () => [
          El('FormItem', { label: '面试结果' }, () => El('RadioGroup', { modelValue: evalForm.result, 'onUpdate:modelValue': v => evalForm.result = v }, () => [
            El('Radio', { label: 1 }, () => '通过'),
            El('Radio', { label: 2 }, () => '未通过')
          ])),
          El('FormItem', { label: '综合评分' }, () => El('Slider', { modelValue: evalForm.score, 'onUpdate:modelValue': v => evalForm.score = v, min: 0, max: 100, showInput: true })),
          El('FormItem', { label: '评价意见' }, () => El('Input', { modelValue: evalForm.comment, 'onUpdate:modelValue': v => evalForm.comment = v, type: 'textarea', rows: 4, placeholder: '技术能力、项目经验、沟通表达等维度的评价' }))
        ]),
        ],
        footer: () => [
        Btn('取消', { onClick: () => evalVisible.value = false }),
        Primary('提交评价', saveEval)
        ]
      }) : null
    ]);
  }
};

/* =====================================================================
 * 7. 录用与 offer
 * ===================================================================== */
const PageOffer = {
  setup() {
    const pager = usePager((p) => http.get('/offers', p), { keyword: '', status: '' });
    const { state } = pager;
    const offerVisible = Vue.ref(false);
    const offerTarget = Vue.ref(null);
    const offerForm = Vue.reactive({ salary: '', entryDate: daysLater(14), remark: '' });
    const entryVisible = Vue.ref(false);
    const entryTarget = Vue.ref(null);
    const entryDate = Vue.ref(daysLater(7));
    Vue.onMounted(pager.load);
    function openOffer(row) {
      offerTarget.value = row;
      offerForm.salary = (12 + Math.floor(Math.random() * 6)) + 'K';
      offerForm.entryDate = daysLater(14);
      offerVisible.value = true;
    }
    async function submitOffer() {
      if (!offerForm.salary) { ElementPlus.ElMessage.warning('请填写 offer 薪资'); return; }
      const r = await http.post('/offers', { applicationId: offerTarget.value.id, salary: offerForm.salary, entryDate: offerForm.entryDate, remark: offerForm.remark });
      if (r.code !== 200) { ElementPlus.ElMessage.error(r.message); return; }
      ElementPlus.ElMessage.success('offer 已发送给 ' + offerTarget.value.candidateName);
      offerVisible.value = false; pager.load();
    }
    function openEntry(row) { entryTarget.value = row; entryDate.value = daysLater(7); entryVisible.value = true; }
    async function submitEntry() {
      const r = await http.post('/applications/' + entryTarget.value.id + '/entry', { entryDate: entryDate.value });
      if (r.code !== 200) { ElementPlus.ElMessage.error(r.message); return; }
      ElementPlus.ElMessage.success('已确认 ' + entryTarget.value.candidateName + ' 入职');
      entryVisible.value = false; pager.load();
    }
    function reject(row) {
      ElementPlus.ElMessageBox.prompt('请填写候选人拒绝 offer 的原因', '记录拒绝', { inputPlaceholder: '如：接受了其他公司offer' })
        .then(async ({ value }) => {
          const r = await http.post('/applications/' + row.id + '/reject', { reason: value });
          if (r.code !== 200) { ElementPlus.ElMessage.error(r.message); return; }
          ElementPlus.ElMessage.success('已记录拒绝原因'); pager.load();
        }).catch(() => { });
    }
    return () => h(Vue.Fragment, null, [
      Card('录用与 offer 管理', [
        h('div', { class: 'toolbar' }, [
          El('Input', { modelValue: state.query.keyword, 'onUpdate:modelValue': v => state.query.keyword = v, placeholder: '搜索候选人 / 职位', clearable: true, style: 'width:210px', onKeyup: e => e.key === 'Enter' && pager.search() }, () => null),
          El('Select', { modelValue: state.query.status, 'onUpdate:modelValue': v => { state.query.status = v; pager.search(); }, placeholder: '状态', clearable: true, style: 'width:132px' }, () =>
            [{ v: 6, l: '面试通过' }, { v: 7, l: '已发offer' }, { v: 8, l: '已入职' }].map(o => El('Option', { key: o.v, label: o.l, value: o.v }))),
          Primary('查询', pager.search)
        ]),
        El('Table', { data: state.list, loading: state.loading, stripe: true }, () => [
          El('TableColumn', { label: '候选人', minWidth: 150 }, (s) => h('div', [
            h('div', { style: 'font-weight:600' }, s.row.candidateName),
            h('div', { class: 'muted' }, s.row.education + ' · ' + s.row.school)
          ])),
          El('TableColumn', { label: '录用职位', minWidth: 165, showOverflowTooltip: true }, (s) => s.row.jobTitle),
          El('TableColumn', { label: '面试评分', width: 96 }, (s) => s.row.score ? Span(s.row.score + ' 分', 'color:#16a34a;font-weight:600') : Span('—', 'color:#c0c4cc')),
          El('TableColumn', { label: 'offer 薪资', width: 104 }, (s) => s.row.offerSalary ? Span(s.row.offerSalary, 'color:#ef4444;font-weight:600') : '—'),
          El('TableColumn', { label: '预计入职', width: 106 }, (s) => s.row.entryDate || '—'),
          El('TableColumn', { label: '状态', width: 104 }, (s) => h(AppStatusTag, { status: s.row.status })),
          El('TableColumn', { label: '操作', width: 150, fixed: 'right' }, (s) => Ops([
            s.row.status === 6 ? { label: '发放offer', onClick: () => openOffer(s.row) } : null,
            s.row.status === 7 ? { label: '确认入职', onClick: () => openEntry(s.row) } : null,
            [6, 7].includes(s.row.status) ? { label: '标记拒绝', type: 'danger', onClick: () => reject(s.row) } : null
          ]))
        ]),
        h(Pager, { total: state.total, page: state.page, size: state.size, onChange: pager.onPage })
      ]),

      offerVisible.value ? El('Dialog', { modelValue: true, 'onUpdate:modelValue': v => offerVisible.value = v, title: '发放 offer', width: '500px' }, {
        default: () => [
        El('Descriptions', { column: 2, border: true, size: 'small', style: 'margin-bottom:14px' }, () => [
          El('DescriptionsItem', { label: '候选人' }, () => offerTarget.value.candidateName),
          El('DescriptionsItem', { label: '职位' }, () => offerTarget.value.jobTitle)
        ]),
        El('Form', { model: offerForm, labelWidth: '90px' }, () => [
          El('FormItem', { label: 'offer薪资', required: true }, () => El('Input', { modelValue: offerForm.salary, 'onUpdate:modelValue': v => offerForm.salary = v, placeholder: '如：18K' })),
          El('FormItem', { label: '预计入职' }, () => El('DatePicker', { modelValue: offerForm.entryDate, 'onUpdate:modelValue': v => offerForm.entryDate = v, type: 'date', valueFormat: 'YYYY-MM-DD', style: 'width:100%' })),
          El('FormItem', { label: '备注' }, () => El('Input', { modelValue: offerForm.remark, 'onUpdate:modelValue': v => offerForm.remark = v, type: 'textarea', rows: 3 }))
        ]),
        ],
        footer: () => [
        Btn('取消', { onClick: () => offerVisible.value = false }),
        Primary('确认发放', submitOffer)
        ]
      }) : null,

      entryVisible.value ? El('Dialog', { modelValue: true, 'onUpdate:modelValue': v => entryVisible.value = v, title: '确认入职', width: '420px' }, {
        default: () => [
        Field('入职日期', El('DatePicker', { modelValue: entryDate.value, 'onUpdate:modelValue': v => entryDate.value = v, type: 'date', valueFormat: 'YYYY-MM-DD', style: 'width:100%' })),
        ],
        footer: () => [
        Btn('取消', { onClick: () => entryVisible.value = false }),
        Primary('确认入职', submitEntry)
        ]
      }) : null
    ]);
  }
};

/* =====================================================================
 * 8. 标签管理
 * ===================================================================== */
const PageTags = {
  setup() {
    const list = Vue.ref([]);
    const dialog = Vue.ref(false);
    const form = Vue.reactive({ id: null, name: '', color: '#2f6fed' });
    async function load() { const r = await http.get('/tags'); if (r.code === 200) list.value = r.data; }
    Vue.onMounted(load);
    function openAdd() { Object.assign(form, { id: null, name: '', color: '#2f6fed' }); dialog.value = true; }
    function openEdit(row) { Object.assign(form, row); dialog.value = true; }
    async function save() {
      if (!form.name) { ElementPlus.ElMessage.warning('请填写标签名称'); return; }
      const r = form.id ? await http.put('/tags/' + form.id, form) : await http.post('/tags', form);
      if (r.code !== 200) { ElementPlus.ElMessage.error(r.message); return; }
      ElementPlus.ElMessage.success(r.message); dialog.value = false; load();
    }
    function remove(row) {
      ElementPlus.ElMessageBox.confirm('删除标签「' + row.name + '」后，候选人身上的该标签也会移除，确认？', '提示', { type: 'warning' }).then(async () => {
        const r = await http.del('/tags/' + row.id);
        if (r.code !== 200) { ElementPlus.ElMessage.error(r.message); return; }
        ElementPlus.ElMessage.success('删除成功'); load();
      }).catch(() => { });
    }
    return () => Card('候选人标签', [
      h('div', { class: 'toolbar' }, [
        h('div', { class: 'muted' }, '标签用于候选人分类与快速检索，例如「重点推荐」「大厂背景」。'),
        h('div', { class: 'grow' }),
        Primary('+ 新增标签', openAdd)
      ]),
      El('Table', { data: list.value, stripe: true }, () => [
        El('TableColumn', { label: '标签', minWidth: 160 }, (s) => El('Tag', { color: s.row.color, effect: 'dark', style: 'border:none' }, () => s.row.name)),
        El('TableColumn', { prop: 'color', label: '颜色值', width: 140 }),
        El('TableColumn', { label: '已标记候选人', width: 140 }, (s) => String(DB.applications.filter(a => a.tagIds.includes(s.row.id)).length)),
        El('TableColumn', { label: '操作', width: 130 }, (s) => Ops([
          { label: '编辑', onClick: () => openEdit(s.row) },
          { label: '删除', type: 'danger', onClick: () => remove(s.row) }
        ]))
      ]),
      dialog.value ? El('Dialog', { modelValue: true, 'onUpdate:modelValue': v => dialog.value = v, title: form.id ? '编辑标签' : '新增标签', width: '420px' }, {
        default: () => [
        El('Form', { model: form, labelWidth: '80px' }, () => [
          El('FormItem', { label: '标签名称', required: true }, () => El('Input', { modelValue: form.name, 'onUpdate:modelValue': v => form.name = v })),
          El('FormItem', { label: '标签颜色' }, () => El('ColorPicker', { modelValue: form.color, 'onUpdate:modelValue': v => form.color = v || '#2f6fed' }))
        ]),
        ],
        footer: () => [
        Btn('取消', { onClick: () => dialog.value = false }),
        Primary('保存', save)
        ]
      }) : null
    ]);
  }
};

/* =====================================================================
 * 9. 用户管理
 * ===================================================================== */
const PageUsers = {
  setup() {
    const pager = usePager((p) => http.get('/system/users', p), { keyword: '', roleId: '', status: '' });
    const { state } = pager;
    const roles = Vue.ref([]);
    const dialog = Vue.ref(false);
    const form = Vue.reactive({});
    const current = () => Store.user && Store.user.id;

    Vue.onMounted(async () => {
      const r = await http.get('/system/roles/all');
      if (r.code === 200) roles.value = r.data;
      pager.load();
    });
    function openAdd() {
      Object.assign(form, { id: null, username: '', realName: '', password: '123456', roleId: null, deptId: null, phone: '', email: '', status: 1 });
      dialog.value = true;
    }
    function openEdit(row) { Object.assign(form, Object.assign({}, row, { password: '' })); dialog.value = true; }
    async function save() {
      if (!form.username || !form.realName) { ElementPlus.ElMessage.warning('用户名与姓名必填'); return; }
      if (!form.roleId) { ElementPlus.ElMessage.warning('请选择角色'); return; }
      const r = form.id ? await http.put('/system/users/' + form.id, form) : await http.post('/system/users', form);
      if (r.code !== 200) { ElementPlus.ElMessage.error(r.message); return; }
      ElementPlus.ElMessage.success(r.message); dialog.value = false; pager.load();
    }
    async function toggleStatus(row) {
      const next = row.status === 1 ? 0 : 1;
      const r = await http.put('/system/users/' + row.id + '/status', { status: next });
      if (r.code !== 200) { ElementPlus.ElMessage.error(r.message); return; }
      ElementPlus.ElMessage.success(next ? '已启用' : '已停用'); pager.load();
    }
    function remove(row) {
      ElementPlus.ElMessageBox.confirm('确认删除用户「' + row.realName + '」？', '提示', { type: 'warning' }).then(async () => {
        const r = await http.del('/system/users/' + row.id);
        if (r.code !== 200) { ElementPlus.ElMessage.error(r.message); return; }
        ElementPlus.ElMessage.success('删除成功'); pager.load();
      }).catch(() => { });
    }
    return () => Card('系统用户', [
      h('div', { class: 'toolbar' }, [
        El('Input', { modelValue: state.query.keyword, 'onUpdate:modelValue': v => state.query.keyword = v, placeholder: '搜索用户名 / 姓名 / 手机号', clearable: true, style: 'width:220px', onKeyup: e => e.key === 'Enter' && pager.search() }, () => null),
        El('Select', { modelValue: state.query.roleId, 'onUpdate:modelValue': v => { state.query.roleId = v; pager.search(); }, placeholder: '角色', clearable: true, style: 'width:140px' },
          () => roles.value.map(r => El('Option', { key: r.id, label: r.name, value: r.id }))),
        El('Select', { modelValue: state.query.status, 'onUpdate:modelValue': v => { state.query.status = v; pager.search(); }, placeholder: '状态', clearable: true, style: 'width:104px' }, () =>
          [{ v: 1, l: '启用' }, { v: 0, l: '停用' }].map(o => El('Option', { key: o.v, label: o.l, value: o.v }))),
        Primary('查询', pager.search),
        h('div', { class: 'grow' }),
        Primary('+ 新增用户', openAdd)
      ]),
      El('Table', { data: state.list, loading: state.loading, stripe: true }, () => [
        El('TableColumn', { label: '账号', minWidth: 140 }, (s) => h('div', [
          h('div', { style: 'font-weight:600' }, s.row.realName),
          h('div', { class: 'muted' }, s.row.username)
        ])),
        El('TableColumn', { label: '角色 / 部门', minWidth: 165, showOverflowTooltip: true }, (s) => h('div', [
          h('div', {}, s.row.roleName),
          h('div', { class: 'muted' }, s.row.deptName)
        ])),
        El('TableColumn', { label: '联系方式', minWidth: 175, showOverflowTooltip: true }, (s) => h('div', [
          h('div', {}, s.row.phone || '—'),
          h('div', { class: 'muted' }, s.row.email || '—')
        ])),
        El('TableColumn', { label: '状态', width: 92 }, (s) => El('Tag', { size: 'small', type: s.row.status === 1 ? 'success' : 'danger' }, () => s.row.status === 1 ? '启用' : '停用')),
        El('TableColumn', { label: '创建时间', width: 108 }, (s) => Span((s.row.createTime || '').slice(0, 10), 'font-size:12.5px')),
        El('TableColumn', { label: '操作', width: 130, fixed: 'right' }, (s) => Ops([
          { label: '编辑', onClick: () => openEdit(s.row) },
          s.row.id === current() ? null : { label: s.row.status === 1 ? '停用' : '启用', type: 'warning', onClick: () => toggleStatus(s.row) },
          s.row.id === current() ? null : { label: '删除', type: 'danger', onClick: () => remove(s.row) }
        ]))
      ]),
      h(Pager, { total: state.total, page: state.page, size: state.size, onChange: pager.onPage }),

      dialog.value ? El('Dialog', { modelValue: true, 'onUpdate:modelValue': v => dialog.value = v, title: form.id ? '编辑用户' : '新增用户', width: '560px' }, {
        default: () => [
        El('Form', { model: form, labelWidth: '90px' }, () => [
          El('FormItem', { label: '用户名', required: true }, () => El('Input', { modelValue: form.username, 'onUpdate:modelValue': v => form.username = v, disabled: !!form.id })),
          El('FormItem', { label: '姓名', required: true }, () => El('Input', { modelValue: form.realName, 'onUpdate:modelValue': v => form.realName = v })),
          El('FormItem', { label: '角色', required: true }, () => El('Select', { modelValue: form.roleId, 'onUpdate:modelValue': v => form.roleId = v, style: 'width:100%', placeholder: '按 RBAC 为账号分配角色' },
            () => roles.value.map(r => El('Option', { key: r.id, label: r.name + '（' + r.code + '）', value: r.id })))),
          El('FormItem', { label: '手机号' }, () => El('Input', { modelValue: form.phone, 'onUpdate:modelValue': v => form.phone = v })),
          El('FormItem', { label: '邮箱' }, () => El('Input', { modelValue: form.email, 'onUpdate:modelValue': v => form.email = v })),
          El('FormItem', { label: '状态' }, () => El('Switch', { modelValue: form.status, 'onUpdate:modelValue': v => form.status = v ? 1 : 0, activeText: '启用', inactiveText: '停用' })),
          El('FormItem', { label: form.id ? '重置密码' : '初始密码' }, () => El('Input', { modelValue: form.password, 'onUpdate:modelValue': v => form.password = v, type: 'password', showPassword: true, placeholder: form.id ? '留空则不修改密码' : '默认 123456' }))
        ]),
        ],
        footer: () => [
        Btn('取消', { onClick: () => dialog.value = false }),
        Primary('保存', save)
        ]
      }) : null
    ]);
  }
};

/* =====================================================================
 * 10. 角色与权限管理（RBAC）
 * ===================================================================== */
const PageRoles = {
  setup() {
    const pager = usePager((p) => http.get('/system/roles', p), { keyword: '' });
    const { state } = pager;
    const dialog = Vue.ref(false);
    const form = Vue.reactive({ id: null, code: '', name: '', remark: '', status: 1 });
    const permVisible = Vue.ref(false);
    const permTarget = Vue.ref(null);
    const permChecked = Vue.ref([]);
    const permModules = Vue.computed(() => {
      const g = {};
      PERMISSION_TREE.forEach(p => { (g[p.module] = g[p.module] || []).push(p); });
      return g;
    });
    Vue.onMounted(pager.load);
    function openAdd() { Object.assign(form, { id: null, code: '', name: '', remark: '', status: 1 }); dialog.value = true; }
    function openEdit(row) { Object.assign(form, { id: row.id, code: row.code, name: row.name, remark: row.remark, status: row.status }); dialog.value = true; }
    async function save() {
      if (!form.code || !form.name) { ElementPlus.ElMessage.warning('角色编码与名称必填'); return; }
      const r = form.id ? await http.put('/system/roles/' + form.id, form) : await http.post('/system/roles', form);
      if (r.code !== 200) { ElementPlus.ElMessage.error(r.message); return; }
      ElementPlus.ElMessage.success(r.message); dialog.value = false; pager.load();
    }
    async function openPerm(row) {
      const r = await http.get('/system/roles/' + row.id + '/permissions');
      permTarget.value = row;
      permChecked.value = r.code === 200 ? r.data.slice() : [];
      permVisible.value = true;
    }
    async function savePerm() {
      const r = await http.put('/system/roles/' + permTarget.value.id + '/permissions', { permissions: permChecked.value });
      if (r.code !== 200) { ElementPlus.ElMessage.error(r.message); return; }
      ElementPlus.ElMessage.success('已为「' + permTarget.value.name + '」分配 ' + permChecked.value.length + ' 个权限点');
      permVisible.value = false; pager.load();
    }
    function remove(row) {
      ElementPlus.ElMessageBox.confirm('确认删除角色「' + row.name + '」？', '提示', { type: 'warning' }).then(async () => {
        const r = await http.del('/system/roles/' + row.id);
        if (r.code !== 200) { ElementPlus.ElMessage.error(r.message); return; }
        ElementPlus.ElMessage.success('删除成功'); pager.load();
      }).catch(() => { });
    }
    return () => h(Vue.Fragment, null, [
      Card('角色管理', [
        h('div', { class: 'note' }, '先给角色分配权限点，再给用户分配角色；前端据返回的 permissions 控制菜单与按钮。'),
        h('div', { class: 'toolbar' }, [
          El('Input', { modelValue: state.query.keyword, 'onUpdate:modelValue': v => state.query.keyword = v, placeholder: '角色名称 / 编码', clearable: true, style: 'width:200px', onKeyup: e => e.key === 'Enter' && pager.search() }, () => null),
          Primary('查询', pager.search),
          Btn('重置', { onClick: pager.reset }),
          h('div', { class: 'grow' }),
          Primary('+ 新增角色', openAdd)
        ]),
        El('Table', { data: state.list, loading: state.loading, stripe: true }, () => [
          El('TableColumn', { prop: 'name', label: '角色名称', width: 170 }),
          El('TableColumn', { prop: 'code', label: '角色编码', width: 130 }, (s) => El('Tag', { size: 'small', type: 'info' }, () => s.row.code)),
          El('TableColumn', { prop: 'remark', label: '说明', minWidth: 180 }),
          El('TableColumn', { label: '权限点数', width: 100 }, (s) => String(s.row.permCount)),
          El('TableColumn', { label: '用户数', width: 90 }, (s) => String(s.row.userCount)),
          El('TableColumn', { label: '状态', width: 95 }, (s) => El('Tag', { size: 'small', type: s.row.status === 1 ? 'success' : 'info' }, () => s.row.status === 1 ? '启用' : '停用')),
          El('TableColumn', { label: '操作', width: 190, fixed: 'right' }, (s) => Ops([
            { label: '分配权限', onClick: () => openPerm(s.row) },
            { label: '编辑', onClick: () => openEdit(s.row) },
            { label: '删除', type: 'danger', onClick: () => remove(s.row) }
          ]))
        ]),
        h(Pager, { total: state.total, page: state.page, size: state.size, onChange: pager.onPage })
      ]),
      dialog.value ? El('Dialog', { modelValue: true, 'onUpdate:modelValue': v => dialog.value = v, title: form.id ? '编辑角色' : '新增角色', width: '460px' }, {
        default: () => [
        El('Form', { model: form, labelWidth: '90px' }, () => [
          El('FormItem', { label: '角色编码', required: true }, () => El('Input', { modelValue: form.code, 'onUpdate:modelValue': v => form.code = v, disabled: !!form.id, placeholder: '如：HR_MANAGER' })),
          El('FormItem', { label: '角色名称', required: true }, () => El('Input', { modelValue: form.name, 'onUpdate:modelValue': v => form.name = v })),
          El('FormItem', { label: '说明' }, () => El('Input', { modelValue: form.remark, 'onUpdate:modelValue': v => form.remark = v, type: 'textarea', rows: 2 })),
          El('FormItem', { label: '状态' }, () => El('Switch', { modelValue: form.status, 'onUpdate:modelValue': v => form.status = v ? 1 : 0, activeText: '启用', inactiveText: '停用' }))
        ]),
        ],
        footer: () => [
        Btn('取消', { onClick: () => dialog.value = false }),
        Primary('保存', save)
        ]
      }) : null,
      permVisible.value ? El('Dialog', { modelValue: true, 'onUpdate:modelValue': v => permVisible.value = v, title: '为「' + permTarget.value.name + '」分配权限', width: '620px' }, {
        default: () => [
        Object.keys(permModules.value).map(mod => h('div', { style: 'margin-bottom:12px' }, [
          h('div', { style: 'font-weight:600;font-size:13.5px;margin-bottom:6px;color:#475569' }, mod),
          El('CheckboxGroup', { modelValue: permChecked.value, 'onUpdate:modelValue': v => permChecked.value = v, style: 'display:flex;flex-wrap:wrap' }, () =>
            permModules.value[mod].map(p => El('Checkbox', { key: p.code, label: p.code, style: 'width:180px;margin:4px 0' }, () => p.name)))
        ])),
        ],
        footer: () => [
        Btn('全选', { onClick: () => permChecked.value = PERMISSION_TREE.map(x => x.code) }),
        Btn('清空', { onClick: () => permChecked.value = [] }),
        Primary('保存权限', savePerm)
        ]
      }) : null
    ]);
  }
};

/* =====================================================================
 * 11. 企业与部门管理
 * ===================================================================== */
const PageDepts = {
  setup() {
    const tree = Vue.ref([]);
    const loading = Vue.ref(false);
    const dialog = Vue.ref(false);
    const form = Vue.reactive({ id: null, parentId: 0, name: '', leader: '', phone: '', sort: 10, status: 1 });
    const flatParents = Vue.computed(() => {
      const out = [{ id: 0, name: '（作为顶级公司）' }];
      const walk = (nodes, lv) => (nodes || []).forEach(n => {
        out.push({ id: n.id, name: '　'.repeat(lv) + n.name });
        walk(n.children, lv + 1);
      });
      walk(tree.value, 0);
      return out;
    });
    async function load() {
      loading.value = true;
      try { const r = await http.get('/system/depts/tree'); if (r.code === 200) tree.value = r.data; }
      finally { loading.value = false; }
    }
    Vue.onMounted(load);
    function openAdd(parent) {
      Object.assign(form, { id: null, parentId: parent ? parent.id : 0, name: '', leader: '', phone: '', sort: 10, status: 1 });
      dialog.value = true;
    }
    function openEdit(row) { Object.assign(form, { id: row.id, parentId: row.parentId, name: row.name, leader: row.leader, phone: row.phone, sort: row.sort, status: row.status }); dialog.value = true; }
    async function save() {
      if (!form.name) { ElementPlus.ElMessage.warning('请填写部门名称'); return; }
      const r = form.id ? await http.put('/system/depts/' + form.id, form) : await http.post('/system/depts', form);
      if (r.code !== 200) { ElementPlus.ElMessage.error(r.message); return; }
      ElementPlus.ElMessage.success(r.message); dialog.value = false; load();
    }
    function remove(row) {
      ElementPlus.ElMessageBox.confirm('确认删除「' + row.name + '」？', '提示', { type: 'warning' }).then(async () => {
        const r = await http.del('/system/depts/' + row.id);
        if (r.code !== 200) { ElementPlus.ElMessage.error(r.message); return; }
        ElementPlus.ElMessage.success('删除成功'); load();
      }).catch(() => { });
    }
    return () => h(Vue.Fragment, null, [
      Card('企业与部门（组织架构）', [
        h('div', { class: 'toolbar' }, [
          h('div', { class: 'muted' }, '顶级节点代表企业信息，下级节点为部门；部门用于职位归属与用户归属。'),
          h('div', { class: 'grow' }),
          Primary('+ 新增顶级公司', () => openAdd(null))
        ]),
        El('Table', {
          data: tree.value, loading: loading.value, rowKey: 'id', defaultExpandAll: true,
          treeProps: { children: 'children', hasChildren: 'hasChildren' }
        }, () => [
          El('TableColumn', { prop: 'name', label: '部门/公司名称', minWidth: 220 }),
          El('TableColumn', { prop: 'leader', label: '负责人', width: 120 }),
          El('TableColumn', { prop: 'phone', label: '联系电话', width: 150 }),
          El('TableColumn', { prop: 'sort', label: '排序', width: 80 }),
          El('TableColumn', { label: '人数', width: 80 }, (s) => String(DB.users.filter(u => u.deptId === s.row.id).length)),
          El('TableColumn', { label: '状态', width: 95 }, (s) => El('Tag', { size: 'small', type: s.row.status === 1 ? 'success' : 'info' }, () => s.row.status === 1 ? '正常' : '停用')),
          El('TableColumn', { label: '操作', width: 200 }, (s) => Ops([
            { label: '新增下级', onClick: () => openAdd(s.row) },
            { label: '编辑', onClick: () => openEdit(s.row) },
            { label: '删除', type: 'danger', onClick: () => remove(s.row) }
          ]))
        ])
      ]),
      dialog.value ? El('Dialog', { modelValue: true, 'onUpdate:modelValue': v => dialog.value = v, title: form.id ? '编辑组织节点' : '新增组织节点', width: '520px' }, {
        default: () => [
        El('Form', { model: form, labelWidth: '100px' }, () => [
          El('FormItem', { label: '上级节点' }, () => El('Select', { modelValue: form.parentId, 'onUpdate:modelValue': v => form.parentId = v, style: 'width:100%' },
            () => flatParents.value.map(p => El('Option', { key: p.id, label: p.name, value: p.id })))),
          El('FormItem', { label: '名称', required: true }, () => El('Input', { modelValue: form.name, 'onUpdate:modelValue': v => form.name = v })),
          El('FormItem', { label: '负责人' }, () => El('Input', { modelValue: form.leader, 'onUpdate:modelValue': v => form.leader = v })),
          El('FormItem', { label: '联系电话' }, () => El('Input', { modelValue: form.phone, 'onUpdate:modelValue': v => form.phone = v })),
          El('FormItem', { label: '排序' }, () => El('InputNumber', { modelValue: form.sort, 'onUpdate:modelValue': v => form.sort = v, min: 1, style: 'width:100%' })),
          El('FormItem', { label: '状态' }, () => El('Switch', { modelValue: form.status, 'onUpdate:modelValue': v => form.status = v ? 1 : 0, activeText: '正常', inactiveText: '停用' }))
        ]),
        ],
        footer: () => [
        Btn('取消', { onClick: () => dialog.value = false }),
        Primary('保存', save)
        ]
      }) : null
    ]);
  }
};

/* =====================================================================
 * 12. 操作日志
 * ===================================================================== */
const PageLogs = {
  setup() {
    const pager = usePager((p) => http.get('/system/logs', p), { keyword: '' });
    const { state } = pager;
    Vue.onMounted(pager.load);
    return () => Card('操作日志', [
      h('div', { class: 'toolbar' }, [
        El('Input', { modelValue: state.query.keyword, 'onUpdate:modelValue': v => state.query.keyword = v, placeholder: '候选人 / 操作人 / 备注', clearable: true, style: 'width:230px', onKeyup: e => e.key === 'Enter' && pager.search() }, () => null),
        Primary('查询', pager.search),
        Btn('重置', { onClick: pager.reset })
      ]),
      El('Table', { data: state.list, loading: state.loading, stripe: true }, () => [
        El('TableColumn', { prop: 'createTime', label: '时间', width: 165 }),
        El('TableColumn', { prop: 'module', label: '模块', width: 110 }),
        El('TableColumn', { prop: 'action', label: '操作', width: 190 }, (s) => El('Tag', { size: 'small', type: 'info' }, () => s.row.action)),
        El('TableColumn', { prop: 'target', label: '对象', minWidth: 200 }),
        El('TableColumn', { prop: 'operator', label: '操作人', width: 100 }),
        El('TableColumn', { prop: 'ip', label: 'IP', width: 130 }),
        El('TableColumn', { prop: 'remark', label: '备注', minWidth: 180 })
      ]),
      h(Pager, { total: state.total, page: state.page, size: state.size, onChange: pager.onPage })
    ]);
  }
};







