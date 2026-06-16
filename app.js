const express = require('express');
const path = require('path');
const indexRouter = require('./routes/index');

const app = express();

// app.js 상단 모듈 불러오는 곳에 추가
const session = require('express-session');

// ... 기존 app.set('view engine', 'ejs'); 아래쪽에 아래 코드 추가 ...

// 세션 설정
app.use(session({
  secret: 'web_programming_secret', // 암호화 키
  resave: false,
  saveUninitialized: true
}));

// 💡 (중요) 모든 EJS 화면에서 user 정보를 사용할 수 있게 넘겨주는 미들웨어
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// 뷰 엔진 설정 (EJS)
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// 💡 (추가) public 폴더를 정적 파일(이미지, CSS 등) 폴더로 사용하겠다고 선언
app.use(express.static(path.join(__dirname, 'public')));

// 데이터 파싱 미들웨어 (POST 요청 시 req.body 사용 가능하게 함)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 라우터 연결
app.use('/', indexRouter);

// 404 에러 처리 핸들러 (잘못된 주소로 접속했을 때)
app.use(function(req, res, next) {
  res.status(404).send('페이지를 찾을 수 없습니다.');
});

// app을 밖으로 내보냄 (bin/www에서 사용)
module.exports = app;