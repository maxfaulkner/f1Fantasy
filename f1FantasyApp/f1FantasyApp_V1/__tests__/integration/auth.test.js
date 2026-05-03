// __tests__/integration/auth.test.js
const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = require('../../app');
const prisma = require('../../prisma');

const SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key';

describe('POST /auth/register', () => {
  test('201: creates a new user with valid data', async () => {
    prisma.user.create.mockResolvedValue({
      id: 'newuser1',
      email: 'new@example.com',
      name: 'New User',
    });

    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'new@example.com', name: 'New User', password: 'secret123' });

    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/created/i);
    expect(res.body.user.email).toBe('new@example.com');
    expect(res.body.user.id).toBe('newuser1');
    // Password must NOT be returned
    expect(res.body.user.password).toBeUndefined();
  });

  test('400: rejects registration with missing email', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ name: 'No Email', password: 'abc123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/missing/i);
  });

  test('400: rejects registration with missing name', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'a@b.com', password: 'abc123' });
    expect(res.status).toBe(400);
  });

  test('400: rejects registration with missing password', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'a@b.com', name: 'Test' });
    expect(res.status).toBe(400);
  });

  test('400: returns email-already-exists for duplicate email (P2002)', async () => {
    const dupError = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    prisma.user.create.mockRejectedValue(dupError);

    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'dup@example.com', name: 'Dup User', password: 'pass123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email already exists/i);
  });

  test('hashes password before storing (bcrypt hash in prisma.create call)', async () => {
    prisma.user.create.mockResolvedValue({ id: 'u1', email: 'h@t.com', name: 'H' });

    await request(app)
      .post('/auth/register')
      .send({ email: 'h@t.com', name: 'H', password: 'plaintext' });

    const createData = prisma.user.create.mock.calls[0][0].data;
    // Stored password should be a bcrypt hash, not the plain text
    expect(createData.password).not.toBe('plaintext');
    expect(createData.password).toMatch(/^\$2b\$/);
  });
});

describe('POST /auth/login', () => {
  let hashedPassword;

  beforeAll(async () => {
    hashedPassword = await bcrypt.hash('correctpassword', 10);
  });

  test('200: returns token + user on valid credentials', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user123',
      email: 'test@example.com',
      name: 'Test User',
      password: hashedPassword,
    });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'test@example.com', password: 'correctpassword' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.id).toBe('user123');
    expect(res.body.user.email).toBe('test@example.com');
    expect(res.body.user.password).toBeUndefined();

    // Token should be a valid JWT
    const decoded = jwt.verify(res.body.token, SECRET);
    expect(decoded.id).toBe('user123');
  });

  test('401: returns error for wrong password', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user123',
      email: 'test@example.com',
      name: 'Test User',
      password: hashedPassword,
    });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'test@example.com', password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid credentials/i);
    expect(res.body.token).toBeUndefined();
  });

  test('401: returns error when user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'nobody@example.com', password: 'anypassword' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid credentials/i);
  });

  test('400: rejects login with missing email', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ password: 'pass' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/missing/i);
  });

  test('400: rejects login with missing password', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'a@b.com' });
    expect(res.status).toBe(400);
  });
});
