/* =====================================================================
 * 04-portal.js
 * 应聘者门户：职位检索 / 职位详情投递 / 我的投递与面试通知
 * 依赖 00-helpers.js；接口为《接口文档.md》第 6、7 节公开接口
 * ===================================================================== */

/* =====================================================================
 * 1. 职位检索（门户首页）
 * ===================================================================== */
const PagePortalJobs = {
  setup() {
    const pager = usePager((p) => http.get('/portal/jobs', p), { keyword: '', categoryId: '', city: '', jobType: '' });
    const { state } = pager;
    const cats = Vue.ref([]);
    Vue.onMounted(async () => {
      const r = await http.get('/job/categories');
      if (r.code === 200) cats.value = r.data;
      pager.load();
    });
    return () => h(Vue.Fragment, null, [
      /* 搜索与筛选合并为一个紧凑区域：一屏内即可完成"搜索 → 筛选 → 点开职位" */
      h('div', { class: 'portal-hero' }, [
        h('h2', '在招职位 ' + (state.total || 0) + ' 个'),
        h('div', { style: 'margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;align-items:center' }, [
          El('Input', {
            modelValue: state.query.keyword, 'onUpdate:modelValue': v => state.query.keyword = v,
            placeholder: '搜索职位或技能，如：Java、Vue3', size: 'large', clearable: true,
            style: 'width:300px', onKeyup: e => e.key === 'Enter' && pager.search()
          }, () => null),
          El('Select', { modelValue: state.query.categoryId, 'onUpdate:modelValue': v => { state.query.categoryId = v; pager.search(); }, placeholder: '职位类别', clearable: true, size: 'large', style: 'width:150px' },
            () => cats.value.map(c => El('Option', { key: c.id, label: c.name, value: c.id }))),
          El('Select', { modelValue: state.query.city, 'onUpdate:modelValue': v => { state.query.city = v; pager.search(); }, placeholder: '城市', clearable: true, size: 'large', style: 'width:120px' },
            () => CITY_OPTIONS.map(c => El('Option', { key: c, label: c, value: c }))),
          El('Select', { modelValue: state.query.jobType, 'onUpdate:modelValue': v => { state.query.jobType = v; pager.search(); }, placeholder: '工作性质', clearable: true, size: 'large', style: 'width:130px' },
            () => Object.keys(JOB_TYPE).map(k => El('Option', { key: k, label: JOB_TYPE[k], value: Number(k) }))),
          Primary('搜索', pager.search, { size: 'large' })
        ])
      ]),

      Card(null, [
        state.loading ? h('div', { class: 'centered' }, '加载中…') : null,
        !state.loading && !state.list.length ? h('div', { class: 'centered' }, '没有符合条件的职位，试试调整筛选条件') : null,
        state.list.map(j => h('div', { class: 'job-card', onClick: () => go('/portal/job/' + j.id) }, [
          h('div', { class: 'jt' }, [
            h('div', null, [j.title, h('span', { class: 'jp' }, fmtMoney(j))]),
            El('Tag', { size: 'small', type: 'success' }, () => JOB_TYPE[j.jobType])
          ]),
          h('div', { class: 'jm' }, [
            Span('📍 ' + j.city),
            Span('🎓 ' + j.eduReq),
            Span('💼 ' + j.expReq),
            Span('🏢 ' + (j.deptName || '—')),
            Span('👥 招 ' + j.headcount + ' 人'),
            Span('📮 已投 ' + j.applyCount + ' 人')
          ]),
          h('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-top:8px;gap:12px' }, [
            h('div', { class: 'tag-line' }, (j.tags || []).map(t => El('Tag', { key: t, size: 'small', type: 'info' }, () => t))),
            h('div', { class: 'muted', style: 'white-space:nowrap' }, '截止 ' + (j.deadline || '招满为止'))
          ])
        ])),
        h(Pager, { total: state.total, page: state.page, size: state.size, onChange: pager.onPage })
      ])
    ]);
  }
};

/* =====================================================================
 * 2. 职位详情 + 在线投递（含简历上传解析）
 * ===================================================================== */
const PagePortalJobDetail = {
  setup() {
    const job = Vue.ref(null);
    const loading = Vue.ref(true);
    const applyVisible = Vue.ref(false);
    const parseVisible = Vue.ref(false);
    const form = Vue.reactive({
      candidateName: '', gender: 1, age: 24, phone: '', email: '',
      education: '本科', school: '', major: '', workYears: '1-3年',
      latestCompany: '', expectSalary: '', resumeName: '', parsed: 0,
      skills: [], selfEval: '', jobId: null
    });
    const sending = Vue.ref(false);
    function jobId() { return matchRoute(Store.route).params.id; }

    Vue.onMounted(async () => {
      const r = await http.get('/jobs/' + jobId());
      loading.value = false;
      if (r.code !== 200) { ElementPlus.ElMessage.error(r.message); return; }
      job.value = r.data;
      form.jobId = r.data.id;
      http.post('/portal/jobs/' + r.data.id + '/view').catch(() => { });
    });
    function openApply() {
      /* 未登录时先登录，投递动作必须绑定到具体账号 */
      if (!Store.user) {
        sessionStorage.setItem('recruit_from', Store.route);
        ElementPlus.ElMessage.warning('投递简历前请先登录');
        go('/login');
        return;
      }
      const u = Store.user;
      form.candidateName = form.candidateName || u.realName || '';
      form.phone = form.phone || u.phone || '';
      form.email = form.email || u.email || '';
      applyVisible.value = true;
    }
    async function submit() {
      if (!form.candidateName) { ElementPlus.ElMessage.warning('请填写姓名'); return; }
      if (!/^1[3-9]\d{9}$/.test(form.phone || '')) { ElementPlus.ElMessage.warning('请填写正确的手机号'); return; }
      /* 未上传简历时按「无附件简历」提交，简历文件仅作为可选加分项 */
      if (!form.parsed) { form.parsed = 1; form.resumeName = form.resumeName || '未上传简历'; }
      sending.value = true;
      try {
        const r = await http.post('/applications', form);
        if (r.code !== 200) { ElementPlus.ElMessage.error(r.message); return; }
        ElementPlus.ElMessageBox.alert('您已成功投递「' + r.data.jobTitle + '」，可在「我的投递」中查看进度。', '投递成功', { type: 'success', confirmButtonText: '查看我的投递' })
          .then(() => go('/portal/mine')).catch(() => go('/portal/mine'));
        applyVisible.value = false;
      } finally { sending.value = false; }
    }
    function onParsed(data) {
      Object.assign(form, data, { parsed: 1 });
      applyVisible.value = true;
      ElementPlus.ElMessage.success('简历解析完成，请核对并补充信息后投递');
    }
    return () => {
      if (loading.value) return h('div', { class: 'centered' }, '加载中…');
      if (!job.value) return h('div', { class: 'centered' }, '职位不存在或已下线');
      const j = job.value;
      return h(Vue.Fragment, null, [
        Card(null, [
          h('div', { style: 'display:flex;justify-content:space-between;align-items:flex-start' }, [
            h('div', null, [
              h('h2', { style: 'margin:0 0 8px' }, j.title),
              h('div', { style: 'color:#ef4444;font-weight:700;font-size:19px;margin-bottom:10px' }, fmtMoney(j) + ' · ' + JOB_TYPE[j.jobType] + ' · ' + j.city),
              h('div', { class: 'tag-line' }, (j.tags || []).map(t => El('Tag', { key: t, size: 'small', type: 'info' }, () => t)))
            ]),
            h('div', { style: 'text-align:right' }, [
              Primary('立即投递', openApply, { size: 'large' }),
              h('div', { class: 'muted', style: 'margin-top:8px' }, '浏览 ' + j.views + ' 次'),
              h('div', null, [Btn('返回职位列表', { onClick: () => go('/portal/jobs'), style: 'margin-top:6px' })])
            ])
          ]),
          El('Descriptions', { column: 3, border: true, size: 'small', style: 'margin-top:16px' }, () => [
            El('DescriptionsItem', { label: '职位类别' }, () => j.categoryName || '—'),
            El('DescriptionsItem', { label: '所属部门' }, () => j.deptName || '—'),
            El('DescriptionsItem', { label: '招聘人数' }, () => j.headcount + ' 人'),
            El('DescriptionsItem', { label: '学历要求' }, () => j.eduReq),
            El('DescriptionsItem', { label: '经验要求' }, () => j.expReq),
            El('DescriptionsItem', { label: '截止日期' }, () => j.deadline || '招满为止')
          ]),
          h('h4', '岗位职责'), h('div', { class: 'jdesc' }, j.description || '—'),
          h('h4', '任职要求'), h('div', { class: 'jdesc' }, j.requirement || '—'),
          h('h4', '应聘流程'),
          h('div', { class: 'flow-steps' }, FUNNEL_STAGES.map((s, i) => h(Vue.Fragment, { key: i }, [
            h('span', { class: 's' }, s.name), i < FUNNEL_STAGES.length - 1 ? h('span', { style: 'color:#cbd5e1' }, '›') : null
          ])))
        ]),

        /* 投递表单 */
        applyVisible.value ? El('Dialog', {
          modelValue: true, 'onUpdate:modelValue': v => applyVisible.value = v,
          title: '投递简历 · ' + j.title, width: '680px', top: '6vh'
        }, {
          default: () => [
          h('div', { class: 'note' }, '简历可选：上传后自动解析并填充下方信息，未上传也可直接提交。'),
          h('div', { style: 'margin-bottom:12px' }, [
            Primary('上传简历自动解析', () => parseVisible.value = true, { type: 'default' }),
            form.parsed ? El('Tag', { type: 'success', size: 'small', style: 'margin-left:8px' }, () => '已解析：' + (form.resumeName || '')) : null
          ]),
          El('Form', { model: form, labelWidth: '96px' }, () => [
            h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:0 18px' }, [
              El('FormItem', { label: '姓名', required: true }, () => El('Input', { modelValue: form.candidateName, 'onUpdate:modelValue': v => form.candidateName = v })),
              El('FormItem', { label: '性别' }, () => El('RadioGroup', { modelValue: form.gender, 'onUpdate:modelValue': v => form.gender = v }, () => [
                El('Radio', { label: 1 }, () => '男'), El('Radio', { label: 2 }, () => '女')
              ])),
              El('FormItem', { label: '年龄' }, () => El('InputNumber', { modelValue: form.age, 'onUpdate:modelValue': v => form.age = v, min: 16, max: 65, style: 'width:100%' })),
              El('FormItem', { label: '手机号', required: true }, () => El('Input', { modelValue: form.phone, 'onUpdate:modelValue': v => form.phone = v })),
              El('FormItem', { label: '邮箱' }, () => El('Input', { modelValue: form.email, 'onUpdate:modelValue': v => form.email = v })),
              El('FormItem', { label: '学历' }, () => El('Select', { modelValue: form.education, 'onUpdate:modelValue': v => form.education = v, style: 'width:100%' },
                () => EDU_OPTIONS.map(e => El('Option', { key: e, label: e, value: e })))),
              El('FormItem', { label: '毕业院校' }, () => El('Input', { modelValue: form.school, 'onUpdate:modelValue': v => form.school = v })),
              El('FormItem', { label: '专业' }, () => El('Input', { modelValue: form.major, 'onUpdate:modelValue': v => form.major = v })),
              El('FormItem', { label: '工作年限' }, () => El('Select', { modelValue: form.workYears, 'onUpdate:modelValue': v => form.workYears = v, style: 'width:100%' },
                () => EXP_OPTIONS.map(e => El('Option', { key: e, label: e, value: e })))),
              El('FormItem', { label: '最近公司' }, () => El('Input', { modelValue: form.latestCompany, 'onUpdate:modelValue': v => form.latestCompany = v })),
              El('FormItem', { label: '期望薪资' }, () => El('Input', { modelValue: form.expectSalary, 'onUpdate:modelValue': v => form.expectSalary = v, placeholder: '如：15K-20K' })),
              El('FormItem', { label: '简历来源' }, () => El('Select', { modelValue: form.source, 'onUpdate:modelValue': v => form.source = v, style: 'width:100%' },
                () => SOURCES.map(s => El('Option', { key: s, label: s, value: s }))))
            ]),
            El('FormItem', { label: '技能标签' }, () => El('Select', { modelValue: form.skills, 'onUpdate:modelValue': v => form.skills = v, multiple: true, filterable: true, allowCreate: true, defaultFirst: true, placeholder: '输入技能后回车', style: 'width:100%' },
              () => (form.skills || []).map(t => El('Option', { key: t, label: t, value: t })))),
            El('FormItem', { label: '自我评价' }, () => El('Input', { modelValue: form.selfEval, 'onUpdate:modelValue': v => form.selfEval = v, type: 'textarea', rows: 3 }))
          ]),
          h('div', { class: 'note' }, '未上传简历时将标记为「无附件简历」。')
          ],
          footer: () => [
            Btn('取消', { onClick: () => applyVisible.value = false }),
            Primary('确认投递', submit, { loading: sending.value })
          ]
        }) : null,

        h(ResumeParseDialog, { modelValue: parseVisible.value, 'onUpdate:modelValue': v => parseVisible.value = v, onParsed: onParsed })
      ]);
    };
  }
};

/* =====================================================================
 * 3. 我的投递与面试通知
 * ===================================================================== */
const PagePortalMine = {
  setup() {
    const list = Vue.ref([]);
    const loading = Vue.ref(false);
    const detail = Vue.ref(null);
    const detailVisible = Vue.ref(false);
    const statusFilter = Vue.ref('');

    async function load() {
      loading.value = true;
      try {
        const r = await http.get('/applications', { mine: true, status: statusFilter.value, pageSize: 100 });
        if (r.code !== 200) { ElementPlus.ElMessage.error(r.message); return; }
        list.value = r.data.list;
      } finally { loading.value = false; }
    }
    Vue.onMounted(load);
    async function openDetail(row) {
      const r = await http.get('/applications/' + row.id);
      if (r.code !== 200) { ElementPlus.ElMessage.error(r.message); return; }
      detail.value = r.data; detailVisible.value = true;
    }
    function withdraw(row) {
      ElementPlus.ElMessageBox.confirm('确认撤回对「' + row.jobTitle + '」的投递？', '撤回投递', { type: 'warning' })
        .then(async () => {
          const r = await http.del('/applications/' + row.id);
          if (r.code !== 200) { ElementPlus.ElMessage.error(r.message); return; }
          ElementPlus.ElMessage.success('已撤回投递'); load();
        }).catch(() => { });
    }
    return () => h(Vue.Fragment, null, [
      Card('我的投递', [
        h('div', { class: 'toolbar' }, [
          El('Select', { modelValue: statusFilter.value, 'onUpdate:modelValue': v => { statusFilter.value = v; load(); }, placeholder: '按状态筛选', clearable: true, style: 'width:150px' },
            () => Object.keys(APP_STATUS).map(k => El('Option', { key: k, label: APP_STATUS[k], value: Number(k) }))),
          Btn('刷新', { onClick: load }),
          h('div', { class: 'grow' }),
          Primary('去投递新职位', () => go('/portal/jobs'))
        ]),
        !loading.value && !list.value.length ? h('div', { class: 'centered' }, '暂无投递记录，去职位列表挑一个吧') : null,
        El('Table', { data: list.value, loading: loading.value, stripe: true }, () => [
          El('TableColumn', { label: '应聘职位', minWidth: 170 }, (s) => h('div', [
            h('div', { style: 'font-weight:600' }, s.row.jobTitle),
            h('div', { class: 'muted' }, (s.row.applyTime || '').slice(0, 16) + ' · ' + s.row.source)
          ])),
          El('TableColumn', { label: '当前进度', width: 112 }, (s) => h(AppStatusTag, { status: s.row.status })),
          El('TableColumn', { label: '流程', minWidth: 250 }, (s) => h('div', { class: 'flow-steps' },
            FUNNEL_STAGES.map((f, i) => h(Vue.Fragment, { key: i }, [
              h('span', { class: 's ' + (s.row.status > f.status ? 'done' : s.row.status === f.status ? 'now' : '') }, f.name),
              i < FUNNEL_STAGES.length - 1 ? h('span', { style: 'color:#cbd5e1' }, '›') : null
            ])))),
          El('TableColumn', { label: '面试', width: 78 }, (s) => s.row.interviewCount ? El('Tag', { size: 'small', type: 'primary' }, () => s.row.interviewCount + ' 轮') : Span('—', 'color:#c0c4cc')),
          El('TableColumn', { label: '操作', width: 116, fixed: 'right' }, (s) => Ops([
            { label: '详情', onClick: () => openDetail(s.row) },
            [1, 3, 9].includes(s.row.status) ? { label: '撤回', type: 'danger', onClick: () => withdraw(s.row) } : null
          ]))
        ])
      ]),

      detailVisible.value && detail.value ? El('Dialog', { modelValue: true, 'onUpdate:modelValue': v => detailVisible.value = v, title: '投递详情', width: '620px', top: '8vh' }, () => [
        h('h3', { style: 'margin:0 0 10px' }, detail.value.jobTitle),
        h('div', { style: 'margin-bottom:12px' }, [h(AppStatusTag, { status: detail.value.status })]),
        El('Descriptions', { column: 2, border: true, size: 'small' }, () => [
          El('DescriptionsItem', { label: '投递时间' }, () => detail.value.applyTime),
          El('DescriptionsItem', { label: '简历来源' }, () => detail.value.source),
          El('DescriptionsItem', { label: '姓名' }, () => detail.value.candidateName),
          El('DescriptionsItem', { label: '手机号' }, () => detail.value.phone),
          El('DescriptionsItem', { label: '简历文件' }, () => detail.value.resumeName || '—'),
          El('DescriptionsItem', { label: '面试评分' }, () => detail.value.score ? detail.value.score + ' 分' : '—')
        ]),
        h('h4', '面试通知'),
        (detail.value.interviews || []).length ? El('Table', { data: detail.value.interviews, size: 'small' }, () => [
          El('TableColumn', { prop: 'round', label: '轮次', width: 60 }),
          El('TableColumn', { prop: 'interviewTime', label: '面试时间', width: 150 }),
          El('TableColumn', { label: '方式', width: 110 }, (s) => (s.row.method === 2 ? '视频面试' : '现场面试')),
          El('TableColumn', { prop: 'address', label: '地点/链接', minWidth: 150 }),
          El('TableColumn', { prop: 'interviewerName', label: '面试官', width: 90 })
        ]) : Span('暂未收到面试通知', 'color:#c0c4cc;font-size:13px'),
        h('h4', '进度轨迹'),
        El('Timeline', null, () => (detail.value.flowLogs || []).map(f =>
          El('TimelineItem', { key: f.id, timestamp: f.createTime, placement: 'top' }, () => h('div', [
            h('b', {}, f.toName), Span('　' + (f.remark || ''), 'color:#64748b;font-size:12.5px')
          ]))
        ))
      ]) : null
    ]);
  }
};
