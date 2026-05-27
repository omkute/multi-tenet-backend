import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prismaWithAudit as prisma } from "@/lib/prisma.js";
import {
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
} from "@/utils/jwt.js";
import { AppError } from "@/utils/app-error.js";
import { logger } from "@/lib/logger.js";

const BCRYPT_COST = 12;
const REFRESH_EXPIRY_DAYS = 7;

export interface AuthResult {
  user: { id: string; email: string; name: string };
  accessToken: string;
  refreshToken: string;
  sessionId: string;
}

export async function signup(
  email: string,
  password: string,
  name: string,
): Promise<AuthResult> {
  const normalizedEmail = email?.trim().toLowerCase();
  const normalizedName = name?.trim();

  if (!normalizedEmail || !password || !normalizedName) {
    throw new AppError("Missing required fields", 400);
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const expiresAt = new Date(
    Date.now() + REFRESH_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  );
  const { raw: refreshToken, hash: refreshTokenHash } = generateRefreshToken();

  try {
    const { user, session } = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: { email: normalizedEmail, passwordHash, name: normalizedName },
      });

      const createdSession = await tx.session.create({
        data: {
          userId: createdUser.id,
          refreshTokenHash,
          expiresAt,
        },
      });

      return { user: createdUser, session: createdSession };
    });

    const accessToken = signAccessToken(user.id, session.id);

    return {
      user: { id: user.id, email: user.email, name: user.name },
      accessToken,
      refreshToken,
      sessionId: session.id,
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      logger.warn({ email: normalizedEmail }, "Duplicate email attempt");
      throw new AppError("Email already in use", 409);
    }
    logger.error({ err: error }, "Unexpected error during signup");
    throw error;
  }
}

export async function login(
  email: string,
  password: string,
): Promise<AuthResult> {
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail || !password) {
    throw new AppError("Missing required fields", 400);
  }

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });
  if (!user) {
    throw new AppError("Invalid credentials", 401);
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new AppError("Invalid credentials", 401);
  }

  const { raw: refreshToken, hash: refreshTokenHash } = generateRefreshToken();
  console.log("refreshToken");
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      refreshTokenHash,
      expiresAt: new Date(
        Date.now() + REFRESH_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
      ),
    },
  });

  const accessToken = signAccessToken(user.id, session.id);

  return {
    user: { id: user.id, email: user.email, name: user.name },
    accessToken,
    refreshToken,
    sessionId: session.id,
  };
}

export async function refresh(rawRefreshToken: string): Promise<AuthResult> {
  const hash = hashRefreshToken(rawRefreshToken);

  const session = await prisma.session.findUnique({
    where: { refreshTokenHash: hash },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    throw new AppError("Invalid refresh token", 401);
  }

  await prisma.session.update({
    where: { id: session.id },
    data: { revokedAt: new Date() },
  });

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
  });
  if (!user) {
    throw new AppError("User not found", 404);
  }

  const { raw: newRefreshToken, hash: newHash } = generateRefreshToken();

  const newSession = await prisma.session.create({
    data: {
      userId: user.id,
      refreshTokenHash: newHash,
      expiresAt: new Date(
        Date.now() + REFRESH_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
      ),
    },
  });

  const accessToken = signAccessToken(user.id, newSession.id);

  return {
    user: { id: user.id, email: user.email, name: user.name },
    accessToken,
    refreshToken: newRefreshToken,
    sessionId: newSession.id,
  };
}

export async function logout(sessionId: string): Promise<void> {
  await prisma.session.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  });
}

export async function logoutAll(userId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, avatarUrl: true },
  });
  if (!user) {
    throw new AppError("User not found", 404);
  }
  return user;
}
