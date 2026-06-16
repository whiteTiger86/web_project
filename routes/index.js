const express = require('express');
const router = express.Router();
// 분리된 2개의 DB 불러오기
const { userDb, productDb } = require('../database');
const bcrypt = require('bcrypt');

// ==========================================
// 1. 과일(상품) 및 쇼핑 기능 - productDb 사용
// ==========================================

// ① 메인 홈페이지 (추천 상품 랜덤으로 4개 노출)
router.get('/', (req, res) => {
  productDb.all("SELECT * FROM products ORDER BY RANDOM() LIMIT 4", [], (err, rows) => {
    if (err) return res.status(500).send("DB 오류");
    res.render('index', { products: rows });
  });
});

// ② 전체 상품 리스트 (10개씩 페이징 처리)
router.get('/products', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 10;
  const offset = (page - 1) * limit;

  productDb.get("SELECT COUNT(*) AS total FROM products", [], (err, result) => {
    if (err) return res.status(500).send("DB 오류");
    const totalPages = Math.ceil(result.total / limit);

    productDb.all("SELECT * FROM products LIMIT ? OFFSET ?", [limit, offset], (err, rows) => {
      if (err) return res.status(500).send("DB 오류");
      res.render('product_list', { products: rows, currentPage: page, totalPages: totalPages });
    });
  });
});

// ③ 상품 상세 페이지 보기
router.get('/product/:id', (req, res) => {
  productDb.get("SELECT * FROM products WHERE id = ?", [req.params.id], (err, product) => {
    if (err || !product) return res.status(404).send('<script>alert("상품을 찾을 수 없습니다."); history.back();</script>');
    res.render('product_detail', { product: product });
  });
});

// ④ 장바구니 / 위시리스트에 담기 (POST)
router.post('/cart/add/:id', (req, res) => {
  if (!req.session.cart) req.session.cart = [];
  const productId = parseInt(req.params.id);
  if (!req.session.cart.includes(productId)) req.session.cart.push(productId);
  res.redirect('/cart');
});

router.post('/wishlist/add/:id', (req, res) => {
  if (!req.session.wishlist) req.session.wishlist = [];
  const productId = parseInt(req.params.id);
  if (!req.session.wishlist.includes(productId)) req.session.wishlist.push(productId);
  res.redirect('/wishlist');
});

// ⑤ 장바구니 및 위시리스트 조회 화면 이동
router.get('/cart', (req, res) => {
  const cartIds = req.session.cart || [];
  if (cartIds.length === 0) return res.render('cart', { products: [] });

  const placeholders = cartIds.map(() => '?').join(',');
  productDb.all(`SELECT * FROM products WHERE id IN (${placeholders})`, cartIds, (err, rows) => {
    res.render('cart', { products: rows });
  });
});

router.get('/wishlist', (req, res) => {
  const wishlistIds = req.session.wishlist || [];
  if (wishlistIds.length === 0) return res.render('wishlist', { products: [] });

  const placeholders = wishlistIds.map(() => '?').join(',');
  productDb.all(`SELECT * FROM products WHERE id IN (${placeholders})`, wishlistIds, (err, rows) => {
    res.render('wishlist', { products: rows });
  });
});

// ⑥ 장바구니 / 위시리스트에서 상품 삭제하기
router.post('/cart/remove/:id', (req, res) => {
  if (req.session.cart) {
    req.session.cart = req.session.cart.filter(id => id !== parseInt(req.params.id));
  }
  res.redirect('/cart');
});

router.post('/wishlist/remove/:id', (req, res) => {
  if (req.session.wishlist) {
    req.session.wishlist = req.session.wishlist.filter(id => id !== parseInt(req.params.id));
  }
  res.redirect('/wishlist');
});

// ⑦ 위시리스트에서 장바구니로 바로 담기 후 위시리스트에서 제거
router.post('/wishlist/to-cart/:id', (req, res) => {
  const productId = parseInt(req.params.id);
  if (!req.session.cart) req.session.cart = [];
  if (!req.session.cart.includes(productId)) req.session.cart.push(productId);
  if (req.session.wishlist) req.session.wishlist = req.session.wishlist.filter(id => id !== productId);
  res.redirect('/cart');
});

// ⑧ 장바구니 상품 결제(구매)하기
router.post('/cart/checkout', (req, res) => {
  if (!req.session.user) return res.send('<script>alert("로그인이 필요한 서비스입니다."); location.href="/login";</script>');

  const cart = req.session.cart || [];
  if (cart.length === 0) return res.send('<script>alert("장바구니가 비어있습니다."); history.back();</script>');

  const userId = req.session.user.id;

  // 1. 장바구니(Session)에 있는 상품 번호를 바탕으로 productDb에서 실제 상품 이름과 가격 조회
  const placeholders = cart.map(() => '?').join(',');
  productDb.all(`SELECT name, price FROM products WHERE id IN (${placeholders})`, cart, (err, products) => {
    if (err || products.length === 0) {
      return res.send('<script>alert("상품 정보를 불러오는데 실패했습니다."); history.back();</script>');
    }

    // 2. 총 결제 금액 계산 및 대표 상품명 만들기
    let totalPrice = 0;
    products.forEach(p => totalPrice += p.price);

    // 예: "달콤한 사과 외 2건" 형태로 만들기
    const productName = products.length > 1
        ? `${products[0].name} 외 ${products.length - 1}건`
        : products[0].name;

    // 3. userDb의 orders 테이블에 주문 내역 저장
    userDb.run(
        `INSERT INTO orders (user_id, product_name, total_price) VALUES (?, ?, ?)`,
        [userId, productName, totalPrice],
        (err) => {
          if (err) {
            console.error("주문 저장 오류:", err.message);
            return res.send('<script>alert("주문 처리 중 오류가 발생했습니다."); history.back();</script>');
          }

          // 4. 결제 완료 처리 (장바구니 세션 비우기)
          req.session.cart = [];

          // 5. 성공 알림 후 "마이페이지"로 바로 이동시켜서 내역 확인하게 함
          res.send('<script>alert("성공적으로 구매가 완료되었습니다! 감사합니다."); location.href="/mypage";</script>');
        }
    );
  });
});


// ==========================================
// 2. 회원가입 및 로그인 처리 - userDb 사용
// ==========================================

router.get('/login', (req, res) => { res.render('login'); });
router.get('/register', (req, res) => {
  res.render('register_step1'); // 우선 약관 동의 페이지로 시작
});

// 🛠️ [추가됨] 아이디 중복 확인 (AJAX 통신용)
router.post('/register/check-id', (req, res) => {
  const { username } = req.body;

  if (!username) return res.json({ exists: false, error: '아이디를 입력하세요.' });

  // userDb에서 해당 아이디가 존재하는지 검색
  userDb.get('SELECT id FROM users WHERE username = ?', [username], (err, row) => {
    if (err) return res.status(500).json({ error: 'DB 오류' });

    if (row) {
      res.json({ exists: true }); // 이미 존재함 (사용 불가)
    } else {
      res.json({ exists: false }); // 존재하지 않음 (사용 가능)
    }
  });
});

// ... (기존 POST /register/step1, /register/step2 등) ...
// 약관 동의 처리 후 정보 입력 폼으로 이동
router.post('/register/step1', (req, res) => {
  if (req.body.agree !== 'on') return res.send('<script>alert("약관에 동의해주세요."); history.back();</script>');
  res.render('register_step2');
});

// 최종 회원가입 처리 (연락처, 주소 추가)
router.post('/register/step2', async (req, res) => {
  // 💡 폼에서 phone, address 데이터도 함께 받아옵니다.
  const { username, password, name, phone, address } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);

  // 💡 DB INSERT 쿼리에 phone, address를 추가했습니다.
  userDb.run('INSERT INTO users (username, password, name, phone, address) VALUES (?, ?, ?, ?, ?)',
      [username, hashedPassword, name, phone, address],
      (err) => {
        if (err) {
          return res.send('<script>alert("이미 존재하는 아이디입니다."); history.back();</script>');
        }

        res.send(`
          <script>
            alert("회원가입이 성공적으로 완료되었습니다!");
            location.href = "/";
          </script>
        `);
      }
  );
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  userDb.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (err || !user) return res.send('<script>alert("정보가 틀렸습니다."); history.back();</script>');
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.send('<script>alert("정보가 틀렸습니다."); history.back();</script>');
    req.session.user = { id: user.id, username: user.username, name: user.name };
    res.redirect('/');
  });
});

router.get('/logout', (req, res) => { req.session.destroy(() => { res.redirect('/'); }); });

// ==========================================
// 💡 [추가됨] 아이디 / 비밀번호 찾기 로직
// ==========================================

// 아이디/비밀번호 찾기 화면 렌더링
router.get('/find-account', (req, res) => {
  res.render('find_account');
});

// 아이디 찾기 처리 (이름으로 검색)
router.post('/find-id', (req, res) => {
  const { name } = req.body;
  userDb.all('SELECT username FROM users WHERE name = ?', [name], (err, rows) => {
    if (err) return res.send('<script>alert("DB 오류가 발생했습니다."); history.back();</script>');
    if (rows.length === 0) {
      return res.send('<script>alert("해당 이름으로 가입된 아이디가 없습니다."); history.back();</script>');
    }

    // 같은 이름으로 가입된 아이디가 여러 개일 수 있으므로 배열을 묶어서 보여줌
    const usernames = rows.map(r => r.username).join(', ');
    res.send(`<script>alert("고객님의 아이디는 [ ${usernames} ] 입니다."); location.href="/login";</script>`);
  });
});

// 비밀번호 찾기 처리 (아이디와 이름으로 확인 후 임시 비밀번호 발급)
router.post('/find-pw', (req, res) => {
  const { username, name } = req.body;
  userDb.get('SELECT * FROM users WHERE username = ? AND name = ?', [username, name], async (err, user) => {
    if (err) return res.send('<script>alert("DB 오류가 발생했습니다."); history.back();</script>');
    if (!user) {
      return res.send('<script>alert("입력하신 정보와 일치하는 계정이 없습니다."); history.back();</script>');
    }

    // 6자리의 임시 비밀번호 무작위 생성
    const tempPassword = Math.random().toString(36).slice(-6);
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    // DB에 임시 비밀번호로 덮어쓰기 업데이트
    userDb.run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, user.id], (err) => {
      if (err) return res.send('<script>alert("비밀번호 업데이트 중 오류가 발생했습니다."); history.back();</script>');
      res.send(`<script>
        alert("임시 비밀번호가 발급되었습니다.\\n\\n임시 비밀번호: [ ${tempPassword} ]\\n\\n로그인 후 반드시 비밀번호를 변경해주세요."); 
        location.href="/login";
      </script>`);
    });
  });
});

// ==========================================
// 3. 고객센터 (게시판) 로직 - userDb 사용
// ==========================================

router.get('/cs', (req, res) => {
  userDb.all("SELECT * FROM posts WHERE parent_id IS NULL ORDER BY id DESC", [], (err, rows) => {
    res.render('board_list', { posts: rows });
  });
});

router.get('/cs/write', (req, res) => { res.render('board_write'); });
router.post('/cs/write', (req, res) => {
  userDb.run("INSERT INTO posts (title, author, content) VALUES (?, ?, ?)", [req.body.title, req.body.author, req.body.content],
      (err) => { res.redirect('/cs'); }
  );
});

router.get('/cs/view/:id', (req, res) => {
  const postId = req.params.id;
  const currentUser = req.session.user ? req.session.user.username : null;

  userDb.get("SELECT * FROM posts WHERE id = ?", [postId], (err, post) => {
    if (!post) return res.status(404).send('<script>alert("없는 게시글입니다."); history.back();</script>');
    if (currentUser !== 'admin' && currentUser !== post.author) return res.send('<script>alert("비밀글입니다. 작성자와 관리자만 볼 수 있습니다."); history.back();</script>');

    userDb.all("SELECT * FROM posts WHERE parent_id = ? ORDER BY id ASC", [postId], (err, replies) => {
      res.render('board_detail', { post: post, replies: replies });
    });
  });
});

router.post('/cs/reply/:id', (req, res) => {
  const currentUser = req.session.user ? req.session.user.username : null;
  if (currentUser !== 'admin') return res.status(403).send('<script>alert("권한이 없습니다."); history.back();</script>');
  userDb.run("INSERT INTO posts (title, author, content, parent_id) VALUES (?, ?, ?, ?)",
      ["↳ [답변] 관련 문의 사항", 'admin', req.body.content, req.params.id],
      (err) => { res.redirect('/cs/view/' + req.params.id); }
  );
});

router.get('/cs/edit/:id', (req, res) => {
  userDb.get("SELECT * FROM posts WHERE id = ?", [req.params.id], (err, row) => { res.render('board_edit', { post: row }); });
});
router.post('/cs/edit/:id', (req, res) => {
  userDb.run("UPDATE posts SET title = ?, content = ? WHERE id = ?", [req.body.title, req.body.content, req.params.id],
      (err) => { res.redirect('/cs/view/' + req.params.id); }
  );
});
router.get('/cs/delete/:id', (req, res) => {
  userDb.run("DELETE FROM posts WHERE id = ?", [req.params.id], (err) => { res.redirect('/cs'); });
});

// ==========================================
// 💡 [추가됨] 마이페이지 (모든 회원 정보 조회)
// ==========================================
router.get('/mypage', (req, res) => {
  // 로그인 여부 확인
  if (!req.session.user) {
    return res.send('<script>alert("로그인이 필요한 서비스입니다."); location.href="/login";</script>');
  }

  const userId = req.session.user.id;

  // 1. 최신 회원 정보 조회 (아이디, 이름, 연락처, 주소 전체)
  userDb.get('SELECT username, name, phone, address FROM users WHERE id = ?', [userId], (err, userInfo) => {
    if (err || !userInfo) {
      return res.send('<script>alert("회원 정보를 불러오는 중 오류가 발생했습니다."); history.back();</script>');
    }

    // 2. 사용자의 주문 내역 조회 (orders 테이블이 존재할 경우 연동, 없을 경우 빈 배열)
    // 여기서는 간단히 구조적 연동을 위해 orders 테이블을 조회합니다.
    userDb.all('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC', [userId], (err, orderRows) => {
      const orders = orderRows || [];

      // 세션 정보 업데이트 (혹시 변경되었을 수 있으므로 최신화)
      req.session.user.name = userInfo.name;

      // 마이페이지 뷰(mypage.ejs)에 데이터 전달
      res.render('mypage', {
        user: userInfo,
        orders: orders
      });
    });
  });
});

module.exports = router;