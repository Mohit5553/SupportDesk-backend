const Ticket = require('../models/Ticket');
const User = require('../models/User');
const Category = require('../models/Category');

const getCurrentShift = () => {
    const hour = new Date().getHours();
    
    // Day: 9am - 6pm (9-18)
    // Evening: 3pm - 12am (15-0)
    // Night: 12am - 9am (0-9)
    
    const shifts = [];
    if (hour >= 9 && hour < 18) shifts.push('Day');
    if (hour >= 15 || hour < 0) shifts.push('Evening');
    if (hour >= 0 && hour < 9) shifts.push('Night');
    
    return shifts;
};

const escalateTickets = async () => {
    try {
        const breachedTickets = await Ticket.find({
            status: { $nin: ['Resolved', 'Closed'] },
            slaDeadline: { $lt: new Date() },
            currentLevel: { $lt: 3 }
        });

        console.log(`Found ${breachedTickets.length} tickets for escalation`);

        for (const ticket of breachedTickets) {
            ticket.currentLevel += 1;
            ticket.slaBreached = true;

            const shifts = getCurrentShift();
            const nextLevel = `Level ${ticket.currentLevel}`;
            
            // Find an agent in the next level currently in shift
            const agents = await User.find({
                role: 'agent',
                level: nextLevel,
                shift: { $in: shifts },
                isActive: true
            }).sort('lastLogin');

            if (agents.length > 0) {
                const nextAgent = agents[0];
                ticket.assignedTo = nextAgent._id;
                ticket.status = 'Assigned';
                
                // Reset SLA deadline for the next level (optional but usually needed)
                // Let's add the same escalation timing again
                const category = await Category.findOne({ name: ticket.category });
                if (category) {
                    const subcat = category.subcategories.find(s => s.name === ticket.subcategory);
                    if (subcat) {
                        ticket.slaDeadline = new Date(Date.now() + subcat.escalationTiming * 60 * 1000);
                    }
                }
            }

            await ticket.save();
            console.log(`Escalated Ticket ${ticket.ticketId} to ${nextLevel}`);
        }
    } catch (error) {
        console.error('Escalation error:', error);
    }
};

module.exports = { escalateTickets, getCurrentShift };
