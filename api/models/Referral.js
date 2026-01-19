// Простая модель для начала
// backend/models/Referral.js
const referralSchema = new mongoose.Schema({
  referrer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  referred: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  level: { type: Number, default: 1 },
  reward: { type: Number, default: 0 },
  status: { type: String, enum: ['pending', 'paid'], default: 'pending' }
});