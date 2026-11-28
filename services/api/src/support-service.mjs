import { AuthError } from "./auth-service.mjs";

const categories = new Set(["trip", "payment", "account", "safety", "general"]);
const statuses = new Set(["open", "in_progress", "resolved", "closed"]);
const boundedText = (value, min, max, field) => {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) throw new AuthError(field + " length is invalid");
  return value.trim();
};
export function createSupportService(pool) {
  return {
    async createTicket(user, body = {}) {
      if (!user?.id || !["passenger", "driver"].includes(user.role)) throw new AuthError("Passenger or driver account required", 403);
      const subject = boundedText(body.subject, 3, 120, "Subject");
      const message = boundedText(body.message, 10, 3000, "Message");
      const category = categories.has(body.category) ? body.category : "general";
      const result = await pool.query(
        "INSERT INTO support_tickets(user_id,subject,message,category) VALUES($1,$2,$3,$4) RETURNING id,subject,message,category,status,created_at",
        [user.id, subject, message, category],
      );
      return { ticket: result.rows[0] };
    },
    async listMyTickets(user) {
      if (!user?.id || !["passenger", "driver"].includes(user.role)) throw new AuthError("Passenger or driver account required", 403);
      const result = await pool.query(
        "SELECT id,subject,message,category,status,owner_reply,replied_at,created_at,updated_at FROM support_tickets WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",
        [user.id],
      );
      return { tickets: result.rows };
    },
    async listOwnerTickets(user, status = null) {
      if (user?.role !== "owner") throw new AuthError("Owner account required", 403);
      if (status && !statuses.has(status)) throw new AuthError("Invalid ticket status");
      const result = await pool.query(
        "SELECT t.id,t.user_id,u.display_name,u.email,t.subject,t.message,t.category,t.status,t.owner_reply,t.created_at,t.updated_at " +
        "FROM support_tickets t JOIN users u ON u.id=t.user_id " +
        "WHERE ($1::text IS NULL OR t.status=$1) ORDER BY t.created_at ASC LIMIT 200",
        [status],
      );
      return { tickets: result.rows };
    },
    async respondToTicket(user, ticketId, body = {}) {
      if (user?.role !== "owner") throw new AuthError("Owner account required", 403);
      const reply = boundedText(body.reply, 2, 3000, "Reply");
      const status = body.status ?? "in_progress";
      if (!statuses.has(status)) throw new AuthError("Invalid ticket status");
      const result = await pool.query(
        "UPDATE support_tickets SET owner_reply=$2,replied_by=$3,replied_at=now(),status=$4,updated_at=now() WHERE id=$1 " +
        "RETURNING id,status,owner_reply,replied_at,updated_at",
        [ticketId, reply, user.id, status],
      );
      if (!result.rowCount) throw new AuthError("Support ticket not found", 404);
      return { ticket: result.rows[0] };
    },
  };
}
