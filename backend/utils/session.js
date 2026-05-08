function getPasswordUpdatedAtSeconds(user) {
  if (!user?.passwordUpdatedAt) {
    return null;
  }

  const passwordUpdatedAt =
    user.passwordUpdatedAt instanceof Date
      ? user.passwordUpdatedAt
      : new Date(user.passwordUpdatedAt);

  if (Number.isNaN(passwordUpdatedAt.getTime())) {
    return null;
  }

  return Math.floor(passwordUpdatedAt.getTime() / 1000);
}

function isTokenStaleForUser(decodedToken, user) {
  if (typeof decodedToken?.iat !== "number") {
    return false;
  }

  const passwordUpdatedAtSeconds = getPasswordUpdatedAtSeconds(user);

  if (passwordUpdatedAtSeconds === null) {
    return false;
  }

  return decodedToken.iat < passwordUpdatedAtSeconds;
}

module.exports = {
  isTokenStaleForUser
};
