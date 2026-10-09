/* =====================================================================
 * 01-config-and-data.js
 * 全局配置 / 数据字典 / Mock 数据库种子
 * 说明：本文件只声明数据，不发起任何请求。
 * ===================================================================== */

/* ---------- 接口配置 ---------- */
/* 文档 1.2.2.1：后端 Spring Boot + MyBatis-Plus，前端 Vue3 + Element Plus，
 * 前后端通过 RESTful 接口交互。useMock 改为 false 即切换真实后端。 */
const API_CONFIG = {
  baseURL: 'http://localhost:8080/api',   // 后端服务地址（context-path 按实际部署调整）
  useMock: true,                          // true=内置 Mock 数据；false=请求真实接口
  mockDelay: 50                           // 演示环境模拟延迟(ms)；追求"简单高效"，此处保持很小
};

/* ---------- 字典：职位 ---------- */
const JOB_STATUS = { 0: '草稿', 1: '招聘中', 2: '已下线', 3: '已关闭' };
const JOB_STATUS_TYPE = { 0: 'info', 1: 'success', 2: 'warning', 3: 'danger' };
const JOB_TYPE = { 1: '全职', 2: '兼职', 3: '实习', 4: '劳务' };
const EDU_OPTIONS = ['不限', '大专', '本科', '硕士', '博士'];
const EXP_OPTIONS = ['不限', '应届生', '1年以内', '1-3年', '3-5年', '5-10年', '10年以上'];
const CITY_OPTIONS = ['深圳', '广州', '北京', '上海', '杭州', '成都', '武汉', '远程'];

/* ---------- 字典：投递状态（文档 1.1.3 招聘漏斗 + 状态流转） ---------- */
const APP_STATUS = {
  1: '待筛选', 2: '已通过筛选', 3: '已淘汰', 4: '待面试',
  5: '面试中', 6: '面试通过', 7: '已发offer', 8: '已入职', 9: '已拒绝'
};
const APP_STATUS_TYPE = {
  1: 'warning', 2: 'primary', 3: 'danger', 4: 'info',
  5: 'info', 6: 'success', 7: 'success', 8: 'success', 9: 'danger'
};
/* 状态机：招聘流程合法流转，与《接口文档.md》4.3 节一致 */
const FLOW = {
  1: [{ to: 2, label: '通过筛选' }, { to: 3, label: '淘汰' }],
  2: [{ to: 4, label: '邀约面试' }, { to: 3, label: '淘汰' }],
  4: [{ to: 5, label: '面试开始' }, { to: 3, label: '淘汰' }],
  5: [{ to: 6, label: '面试通过' }, { to: 3, label: '淘汰' }],
  6: [{ to: 7, label: '发放offer' }, { to: 9, label: '候选人拒绝' }, { to: 3, label: '淘汰' }],
  7: [{ to: 8, label: '确认入职' }, { to: 9, label: '候选人拒绝' }],
  8: [], 9: [], 3: []
};
const FUNNEL_STAGES = [
  { status: 1, name: '简历投递' }, { status: 2, name: '简历筛选' },
  { status: 4, name: '面试邀约' }, { status: 6, name: '面试通过' }, { status: 8, name: '录用入职' }
];

/* ---------- 权限点（RBAC：先给角色配权限，再给用户配角色） ---------- */
const PERMISSION_TREE = [
  { code: 'dashboard:view', name: '数据看板', module: '概览' },
  { code: 'job:list', name: '职位查看', module: '职位管理' },
  { code: 'job:add', name: '职位新增', module: '职位管理' },
  { code: 'job:edit', name: '职位编辑', module: '职位管理' },
  { code: 'job:shelf', name: '职位上下架', module: '职位管理' },
  { code: 'job:category', name: '职位类别管理', module: '职位管理' },
  { code: 'resume:list', name: '简历查看', module: '简历与候选人' },
  { code: 'resume:parse', name: '简历解析', module: '简历与候选人' },
  { code: 'candidate:list', name: '候选人查看', module: '简历与候选人' },
  { code: 'candidate:tag', name: '候选人标签', module: '简历与候选人' },
  { code: 'flow:screen', name: '简历筛选与流转', module: '招聘流程' },
  { code: 'flow:interview', name: '面试安排与通知', module: '招聘流程' },
  { code: 'flow:evaluate', name: '面试评价', module: '招聘流程' },
  { code: 'flow:offer', name: '录用与offer', module: '招聘流程' },
  { code: 'system:user', name: '用户管理', module: '系统管理' },
  { code: 'system:role', name: '角色权限管理', module: '系统管理' },
  { code: 'system:dept', name: '企业与部门管理', module: '系统管理' },
  { code: 'system:log', name: '操作日志', module: '系统管理' }
];

/* =====================================================================
 * Mock 数据库
 * ===================================================================== */
const DB = {};
function pad3(n) { return String(n).padStart(3, '0'); }
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().replace('T', ' ').slice(0, 19); }
function daysLater(n) { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
function rndOf(a) { return a[Math.floor(Math.random() * a.length)]; }

DB.depts = [
  { id: 1, parentId: 0, name: '示例科技股份有限公司', leader: '陈静', phone: '0755-88880000', sort: 1, status: 1 },
  { id: 2, parentId: 1, name: '技术中心', leader: '李维', phone: '0755-88880001', sort: 1, status: 1 },
  { id: 3, parentId: 1, name: '人力资源部', leader: '龚清', phone: '0755-88880002', sort: 2, status: 1 },
  { id: 4, parentId: 2, name: '后端研发组', leader: '李维', phone: '', sort: 1, status: 1 },
  { id: 5, parentId: 2, name: '前端研发组', leader: '陈文', phone: '', sort: 2, status: 1 },
  { id: 6, parentId: 3, name: '招聘组', leader: '邹洪', phone: '', sort: 1, status: 1 }
];

DB.roles = [
  { id: 1, code: 'ADMIN', name: '系统管理员', remark: '拥有全部权限', status: 1, permissions: PERMISSION_TREE.map(p => p.code) },
  {
    id: 2, code: 'HR', name: 'HR/招聘专员', remark: '负责职位、简历与招聘流程', status: 1,
    permissions: ['dashboard:view', 'job:list', 'job:add', 'job:edit', 'job:shelf', 'job:category',
      'resume:list', 'resume:parse', 'candidate:list', 'candidate:tag',
      'flow:screen', 'flow:interview', 'flow:evaluate', 'flow:offer']
  },
  { id: 3, code: 'INTERVIEWER', name: '面试官', remark: '仅面试评价与候选人查看', status: 1, permissions: ['dashboard:view', 'candidate:list', 'flow:interview', 'flow:evaluate'] },
  { id: 4, code: 'CANDIDATE', name: '应聘者', remark: '应聘者门户，仅可操作本人数据', status: 1, permissions: [] }
];

DB.users = [
  { id: 1, username: 'admin', password: '123456', realName: '陈静', roleId: 1, deptId: 1, phone: '13800000001', email: 'admin@example.com', status: 1, createTime: daysAgo(60) },
  { id: 2, username: 'hr', password: '123456', realName: '龚清', roleId: 2, deptId: 6, phone: '13800000002', email: 'hr@example.com', status: 1, createTime: daysAgo(55) },
  { id: 3, username: 'zp', password: '123456', realName: '邹洪', roleId: 2, deptId: 6, phone: '13800000003', email: 'zouhong@example.com', status: 1, createTime: daysAgo(50) },
  { id: 4, username: 'ms', password: '123456', realName: '李维', roleId: 3, deptId: 4, phone: '13800000004', email: 'liwei@example.com', status: 1, createTime: daysAgo(48) },
  { id: 5, username: 'cand', password: '123456', realName: '王小明', roleId: 4, deptId: null, phone: '13900000001', email: 'cand@example.com', status: 1, createTime: daysAgo(20) },
  { id: 6, username: 'disabled', password: '123456', realName: '停用账号', roleId: 2, deptId: 6, phone: '', email: '', status: 0, createTime: daysAgo(30) }
];

DB.jobCategories = [
  { id: 1, name: '技术研发', sort: 1, status: 1 },
  { id: 2, name: '产品设计', sort: 2, status: 1 },
  { id: 3, name: '市场运营', sort: 3, status: 1 },
  { id: 4, name: '职能支持', sort: 4, status: 1 }
];

DB.jobs = [
  {
    id: 1, title: '高级Java开发工程师', categoryId: 1, deptId: 4, jobType: 1, city: '深圳', salaryMin: 20, salaryMax: 35, headcount: 3,
    eduReq: '本科', expReq: '3-5年', tags: ['Spring Boot', 'MySQL', '分布式'],
    description: '1、负责招聘管理系统核心模块的设计与开发；\n2、参与系统架构演进与性能优化；\n3、指导初级工程师完成开发任务。',
    requirement: '1、本科及以上学历，计算机相关专业；\n2、3年以上 Java 后端开发经验，熟悉 Spring Boot / MyBatis-Plus；\n3、熟悉 MySQL 索引与调优，具备高并发经验者优先。',
    status: 1, publishTime: daysAgo(12), deadline: daysLater(20), views: 386, applies: 24, createBy: 2, createTime: daysAgo(12)
  },
  {
    id: 2, title: '前端开发工程师(Vue3)', categoryId: 1, deptId: 5, jobType: 1, city: '深圳', salaryMin: 15, salaryMax: 25, headcount: 2,
    eduReq: '本科', expReq: '1-3年', tags: ['Vue3', 'Element Plus', 'Vite'],
    description: '1、负责招聘管理系统管理端与应聘者门户的前端开发；\n2、与后端协作完成 RESTful 接口联调；\n3、沉淀可复用业务组件。',
    requirement: '1、熟练掌握 Vue3 组合式 API 与 Element Plus；\n2、理解前端工程化（Vite、ESLint）与性能优化；\n3、有中后台系统经验者优先。',
    status: 1, publishTime: daysAgo(9), deadline: daysLater(25), views: 451, applies: 31, createBy: 2, createTime: daysAgo(9)
  },
  {
    id: 3, title: '产品经理(招聘方向)', categoryId: 2, deptId: 3, jobType: 1, city: '深圳', salaryMin: 18, salaryMax: 28, headcount: 1,
    eduReq: '本科', expReq: '3-5年', tags: ['需求分析', 'B端产品'],
    description: '1、负责招聘业务需求调研与产品方案设计；\n2、输出需求文档与原型，跟进研发落地；\n3、跟踪招聘漏斗数据并持续优化流程。',
    requirement: '1、3年以上 B 端产品经验；\n2、熟悉招聘业务全流程与主流招聘平台；\n3、具备良好的跨部门沟通能力。',
    status: 1, publishTime: daysAgo(6), deadline: daysLater(30), views: 268, applies: 15, createBy: 2, createTime: daysAgo(6)
  },
  {
    id: 4, title: '招聘专员', categoryId: 4, deptId: 6, jobType: 1, city: '深圳', salaryMin: 8, salaryMax: 12, headcount: 2,
    eduReq: '大专', expReq: '1年以内', tags: ['校园招聘', '沟通能力'],
    description: '1、负责职位发布与简历初筛；\n2、组织面试安排并跟进面试反馈；\n3、维护候选人库与招聘数据台账。',
    requirement: '1、大专及以上学历，人力资源相关专业优先；\n2、工作细致，具备较强的沟通与协调能力；\n3、可接受应届毕业生。',
    status: 2, publishTime: daysAgo(20), deadline: daysLater(5), views: 197, applies: 18, createBy: 3, createTime: daysAgo(20)
  },
  {
    id: 5, title: '测试工程师(实习)', categoryId: 1, deptId: 4, jobType: 3, city: '深圳', salaryMin: 3, salaryMax: 5, headcount: 2,
    eduReq: '本科', expReq: '应届生', tags: ['功能测试', '接口测试'],
    description: '1、参与需求评审并编写测试用例；\n2、执行功能测试与接口测试，跟踪缺陷闭环。',
    requirement: '1、本科在读，计算机相关专业；\n2、了解软件测试流程，会使用 Postman 者优先；\n3、每周可到岗 4 天以上。',
    status: 0, publishTime: null, deadline: daysLater(40), views: 0, applies: 0, createBy: 2, createTime: daysAgo(2)
  },
  {
    id: 6, title: '市场运营专员', categoryId: 3, deptId: 3, jobType: 1, city: '广州', salaryMin: 9, salaryMax: 14, headcount: 1,
    eduReq: '本科', expReq: '1-3年', tags: ['内容运营', '数据复盘'],
    description: '1、负责雇主品牌内容策划与投放；\n2、运营校园招聘宣讲活动；\n3、复盘渠道转化数据。',
    requirement: '1、1年以上市场或运营经验；\n2、文案功底扎实，熟悉主流新媒体平台。',
    status: 1, publishTime: daysAgo(3), deadline: daysLater(35), views: 132, applies: 8, createBy: 3, createTime: daysAgo(3)
  }
];

DB.tags = [
  { id: 1, name: '重点推荐', color: '#ef4444' },
  { id: 2, name: '大厂背景', color: '#2f6fed' },
  { id: 3, name: '待定', color: '#f59e0b' },
  { id: 4, name: '已发放offer', color: '#16a34a' },
  { id: 5, name: '校招储备', color: '#8b5cf6' }
];

/* 候选人 / 投递记录种子数据 */
const FAMILY = ['王', '李', '张', '刘', '陈', '杨', '黄', '赵', '周', '吴', '徐', '孙', '马', '朱', '胡', '郭', '何', '高', '林', '罗'];
const GIVEN_M = ['伟', '强', '磊', '洋', '勇', '军', '杰', '涛', '明', '超', '浩', '鑫', '斌', '宇', '晨'];
const GIVEN_F = ['静', '敏', '丽', '娜', '芳', '燕', '娟', '婷', '雪', '欣', '悦', '怡', '琳', '倩', '萌'];
const SCHOOLS = ['深圳大学', '华南理工大学', '中山大学', '暨南大学', '广东工业大学', '湖南大学', '武汉理工大学', '电子科技大学'];
const COMPANIES = ['腾讯科技', '字节跳动', '美团', '阿里巴巴', '金蝶软件', '平安科技', '大疆创新', '比亚迪', '顺丰科技'];
const SOURCES = ['官网投递', '招聘网站', '内部推荐', '校园招聘', '猎头'];
const MAJORS = ['计算机科学与技术', '软件工程', '信息管理与信息系统', '市场营销', '人力资源管理', '电子信息工程'];

DB.applications = [];
DB.interviews = [];
DB.flowLogs = [];

(function seedApplications() {
  const statusPool = [1, 1, 1, 2, 2, 3, 4, 4, 5, 6, 7, 8];
  const online = DB.jobs.filter(j => j.status !== 0);
  let appId = 1, ivId = 1;
  for (let i = 0; i < 46; i++) {
    const job = rndOf(online);
    const gender = Math.random() > 0.45 ? 1 : 2;
    const name = rndOf(FAMILY) + (gender === 1 ? rndOf(GIVEN_M) : rndOf(GIVEN_F));
    const status = rndOf(statusPool);
    const stage = status >= 4 ? 3 : (Math.random() > 0.5 ? 2 : 1);
    const app = {
      id: appId, jobId: job.id, jobTitle: job.title,
      candidateName: name, gender: gender, age: 22 + Math.floor(Math.random() * 12),
      phone: '1' + rndOf(['3', '5', '7', '8', '9']) + String(Math.floor(Math.random() * 1e9)).padStart(9, '0'),
      email: 'candidate' + appId + '@example.com',
      education: rndOf(['本科', '本科', '硕士', '大专']),
      school: rndOf(SCHOOLS), major: rndOf(MAJORS),
      workYears: rndOf(['应届生', '1-3年', '3-5年', '5-10年']),
      latestCompany: rndOf(COMPANIES),
      expectSalary: (10 + Math.floor(Math.random() * 15)) + 'K-' + (18 + Math.floor(Math.random() * 18)) + 'K',
      source: rndOf(SOURCES),
      resumeName: name + '-个人简历.pdf',
      resumeUrl: '/files/resume/' + appId + '.pdf',
      parsed: Math.random() > 0.25 ? 1 : 0,
      skills: [rndOf(['Java', 'Vue3', 'Spring Boot', 'MySQL', 'React', 'Python', 'Figma', 'Axure']),
        rndOf(['Element Plus', 'Redis', 'Docker', 'Kubernetes', 'MyBatis-Plus', 'Git'])],
      selfEval: '具备扎实的专业基础与良好的团队协作意识，学习能力强，能够快速融入业务。',
      status: status,
      screenRemark: status === 3 ? '经历与岗位要求匹配度不足' : '',
      score: status >= 6 ? (70 + Math.floor(Math.random() * 30)) : null,
      tagIds: Math.random() > 0.6 ? [rndOf(DB.tags).id] : [],
      offerSalary: status === 7 || status === 8 ? ((15 + Math.floor(Math.random() * 10)) + 'K') : null,
      entryDate: status === 8 ? daysLater(7) : null,
      applyTime: daysAgo(Math.floor(Math.random() * 30)),
      updateTime: daysAgo(Math.floor(Math.random() * 5))
    };
    DB.applications.push(app);
    DB.flowLogs.push({ id: DB.flowLogs.length + 1, applicationId: app.id, fromStatus: 1, toStatus: 1, operator: '王小明', remark: '投递简历（' + app.source + '）', createTime: app.applyTime });
    if (stage >= 2) {
      DB.flowLogs.push({ id: DB.flowLogs.length + 1, applicationId: app.id, fromStatus: 1, toStatus: 2, operator: '龚清', remark: '简历符合岗位要求，通过筛选', createTime: daysAgo(8) });
    }
    if (status === 3) {
      DB.flowLogs.push({ id: DB.flowLogs.length + 1, applicationId: app.id, fromStatus: 2, toStatus: 3, operator: '龚清', remark: app.screenRemark, createTime: daysAgo(5) });
    }
    if (stage >= 3) {
      const date = daysLater(1 + Math.floor(Math.random() * 8));
      const round = status >= 5 ? 2 : 1;
      DB.interviews.push({
        id: ivId++, applicationId: app.id, candidateName: app.candidateName,
        jobId: job.id, jobTitle: job.title, round: round,
        interviewTime: date + ' ' + rndOf(['10:00', '14:00', '15:30', '16:30']),
        duration: rndOf([45, 60, 90]),
        method: rndOf([1, 2]),
        address: rndOf(['总部A座12楼会议室3', '线上腾讯会议 888-666-333']),
        interviewerId: 4, interviewerName: '李维',
        notifyChannel: rndOf(['短信+邮件', '邮件', '短信']), notifyStatus: 1,
        result: status >= 6 ? 1 : 0,
        score: status >= 6 ? app.score : null,
        comment: status >= 6 ? '技术基础扎实，项目经验与岗位匹配，沟通表达清晰，建议进入下一轮。' : '',
        status: status >= 6 ? 2 : 1, createTime: daysAgo(4)
      });
      DB.flowLogs.push({ id: DB.flowLogs.length + 1, applicationId: app.id, fromStatus: 2, toStatus: 4, operator: '龚清', remark: '邀约第' + round + '轮面试', createTime: daysAgo(4) });
    }
  }
})();

/* 为应聘者演示账号「王小明」预置 3 条投递记录，便于门户端演示进度与面试通知 */
(function seedCandidateDemo() {
  const demo = [
    {
      jobId: 2, status: 5, education: '本科', school: '深圳大学', major: '软件工程',
      workYears: '1-3年', latestCompany: '金蝶软件', expectSalary: '15K-22K',
      skills: ['Vue3', 'Element Plus'], applyTime: daysAgo(11), stage: 3,
      selfEval: '两年中后台前端开发经验，熟悉 Vue3 组合式 API 与 Element Plus 组件库，参与过招聘类系统开发。'
    },
    {
      jobId: 1, status: 2, education: '本科', school: '深圳大学', major: '计算机科学与技术',
      workYears: '1-3年', latestCompany: '平安科技', expectSalary: '18K-25K',
      skills: ['Java', 'Spring Boot'], applyTime: daysAgo(6), stage: 2,
      selfEval: '熟悉 Spring Boot 与 MyBatis-Plus，参与过企业内部审批系统的开发与维护。'
    },
    {
      jobId: 6, status: 1, education: '本科', school: '深圳大学', major: '市场营销',
      workYears: '应届生', latestCompany: '—', expectSalary: '9K-12K',
      skills: ['内容运营'], applyTime: daysAgo(2), stage: 1,
      selfEval: '应届毕业生，在校期间负责学院公众号运营，累计产出图文 60 余篇。'
    }
  ];
  demo.forEach((d, idx) => {
    const job = DB.jobs.find(j => j.id === d.jobId);
    const appId = DB.applications.reduce((m, x) => Math.max(m, x.id), 0) + 1;
    const app = {
      id: appId, jobId: d.jobId, jobTitle: job ? job.title : '',
      candidateName: '王小明', gender: 1, age: 24, phone: '13900000001', email: 'cand@example.com',
      education: d.education, school: d.school, major: d.major, workYears: d.workYears,
      latestCompany: d.latestCompany, expectSalary: d.expectSalary, source: '官网投递',
      resumeName: '王小明-个人简历.pdf', resumeUrl: '/files/resume/demo' + idx + '.pdf', parsed: 1,
      skills: d.skills, selfEval: d.selfEval, status: d.status, screenRemark: '', score: null,
      tagIds: [], applyTime: d.applyTime, updateTime: daysAgo(1)
    };
    DB.applications.push(app);
    DB.flowLogs.push({ id: DB.flowLogs.length + 1, applicationId: app.id, fromStatus: 0, toStatus: 1, operator: '王小明', remark: '在线投递简历', createTime: app.applyTime });
    if (d.stage >= 2) {
      DB.flowLogs.push({ id: DB.flowLogs.length + 1, applicationId: app.id, fromStatus: 1, toStatus: 2, operator: '龚清', remark: '简历符合岗位要求，通过筛选', createTime: daysAgo(4) });
      app.tagIds = [2];
    }
    if (d.stage >= 3) {
      const ivId = DB.interviews.reduce((m, x) => Math.max(m, x.id), 0) + 1;
      DB.interviews.push({
        id: ivId, applicationId: app.id, candidateName: app.candidateName, jobId: d.jobId,
        jobTitle: app.jobTitle, round: 1,
        interviewTime: daysLater(2) + ' 14:00', duration: 60, method: 2,
        address: '线上腾讯会议 888-666-333', interviewerId: 4, interviewerName: '李维',
        notifyChannel: '短信+邮件', notifyStatus: 1, result: 0, score: null, comment: '',
        status: 1, createTime: daysAgo(3)
      });
      DB.flowLogs.push({ id: DB.flowLogs.length + 1, applicationId: app.id, fromStatus: 2, toStatus: 4, operator: '龚清', remark: '邀约第1轮面试', createTime: daysAgo(3) });
      DB.flowLogs.push({ id: DB.flowLogs.length + 1, applicationId: app.id, fromStatus: 4, toStatus: 5, operator: '李维', remark: '候选人已到场，面试进行中', createTime: daysAgo(1) });
    }
  });
})();
