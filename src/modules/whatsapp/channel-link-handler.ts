import { normalizeMessageContent, type WAMessage, type WASocket } from "@whiskeysockets/baileys";
import { ChannelLinkError, isChannelLinkingEnabled, issueChannelLinkChallenge,
  recordChannelChallengeDeliveryFailure } from "@/lib/channel-identity-linking";

function channelLinkCommandText(message: WAMessage) {
  if (message.key.fromMe || !message.message || !message.key.remoteJid) return null;
  const jid = message.key.remoteJid;
  if (jid.endsWith("@g.us") || jid.endsWith("@broadcast") || jid.endsWith("@newsletter") || jid === "status@broadcast") return null;
  const content = normalizeMessageContent(message.message);
  const text = content?.conversation ?? content?.extendedTextMessage?.text ?? "";
  return /^\s*(?:vincular|link\s+account)\s*$/i.test(text) ? text : null;
}

export function isChannelLinkCommand(message: WAMessage) {
  return channelLinkCommandText(message) !== null;
}

/**
 * Handles an explicit end-user request in a direct conversation only. The
 * challenge is bound to the server-owned receiving session and to the sender.
 */
export async function handleChannelLinkCommand(sock: WASocket, sessionId: string, message: WAMessage) {
  const text = channelLinkCommandText(message);
  if (text === null || !isChannelLinkingEnabled()) return;

  const remoteJid = message.key.remoteJid!;
  const senderJid = message.key.remoteJidAlt || remoteJid;
  const requestId = message.key.id || undefined;
  let challenge: Awaited<ReturnType<typeof issueChannelLinkChallenge>>;
  try {
    challenge = await issueChannelLinkChallenge({ sessionId, jid: senderJid, requestId });
  } catch (error) {
    const response = error instanceof ChannelLinkError && error.code === "RATE_LIMITED"
      ? "Não foi possível criar outro link agora. Tente novamente mais tarde."
      : "Não foi possível gerar o link de vinculação. Tente novamente mais tarde.";
    await sock.sendMessage(remoteJid, { text: response }).catch(() => undefined);
    return;
  }

  try {
    await sock.sendMessage(remoteJid, {
      text: `Para conectar este WhatsApp à sua conta, entre no site pelo link seguro abaixo. Ele expira em 10 minutos e só pode ser usado uma vez.\n\n${challenge.url}`,
    });
  } catch {
    await recordChannelChallengeDeliveryFailure({
      tenantId: challenge.tenantId,
      challengeId: challenge.challengeId,
      requestId,
    }).catch(() => undefined);
  }
}
