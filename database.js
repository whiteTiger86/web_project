const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// ==========================================
// 1. 유저 & 게시판 데이터베이스 (user_board.db)
// ==========================================
const userDbPath = path.join(__dirname, 'user_board.db');
const userDb = new sqlite3.Database(userDbPath, (err) => {
    if (err) console.error('유저 DB 연결 오류:', err.message);
    else console.log('✅ SQLite DB가 user_board.db 파일에 연결되었습니다.');
});

userDb.serialize(() => {
    // 유저 테이블 생성
    userDb.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        name TEXT,
        phone TEXT,    /* 추가된 연락처 컬럼 */
        address TEXT   /* 추가된 주소 컬럼 */
    )`);

    // 게시판 테이블 생성
    userDb.run(`CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        content TEXT,
        author TEXT,
        parent_id INTEGER,
        created_at DATE DEFAULT (datetime('now','localtime'))
    )`);

    // 🛒 주문 내역 테이블 생성 (여기가 추가된 부분입니다!)
    userDb.run(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        product_name TEXT,
        total_price INTEGER,
        order_date DATETIME DEFAULT (datetime('now','localtime')),
        status TEXT DEFAULT '주문완료'
    )`);
});
// ==========================================
// 2. 과일(상품) 데이터베이스 (product.db)
// ==========================================
const productDbPath = path.join(__dirname, 'product.db');
const productDb = new sqlite3.Database(productDbPath, (err) => {
    if (err) console.error('상품 DB 연결 오류:', err.message);
    else console.log('✅ SQLite DB가 product.db 파일에 연결되었습니다.');
});

productDb.serialize(() => {
    // 상품 테이블 생성
    productDb.run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT, price INTEGER, image TEXT
    )`);

    // 9개의 과일 데이터 초기 삽입
    productDb.get("SELECT COUNT(*) AS count FROM products", (err, row) => {
        if(row && row.count === 0) {
            const stmt = productDb.prepare("INSERT INTO products (name, price, image) VALUES (?, ?, ?)");

            stmt.run("달콤한 사과", 15000, "apple.png");
            stmt.run("신선한 바나나", 8000, "banana.png");
            stmt.run("제주 감귤", 12000, "orange.png");
            stmt.run("상큼한 포도", 20000, "grape.png");
            stmt.run("달콤한 복숭아", 18000, "peach.png");
            stmt.run("시원한 수박", 25000, "watermelon.png");
            stmt.run("새콤달콤 키위", 14000, "kiwi.png");
            stmt.run("비타민 가득 레몬", 16000, "lemon.png");
            stmt.run("랜덤 박스", 10000, "default.png");

            stmt.finalize();
            console.log("✅ 9개의 초기 과일 데이터가 product.db에 성공적으로 추가되었습니다.");
        }
    });
});

// 두 개의 데이터베이스 객체를 모두 내보냅니다.
module.exports = { userDb, productDb };