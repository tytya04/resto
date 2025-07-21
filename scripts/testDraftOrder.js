require('dotenv').config();
const { DraftOrder, DraftOrderItem, sequelize } = require('../src/database/models');
const draftOrderService = require('../src/services/DraftOrderService');
const logger = require('../src/utils/logger');

async function test() {
  try {
    console.log('Testing draft order functionality...\n');
    
    // Test 1: Get current draft for user 3 (restaurant 1)
    console.log('1. Getting current draft for user 3:');
    const draft1 = await draftOrderService.getCurrentDraft(3);
    console.log(`Draft ID: ${draft1.id}, Items: ${draft1.items?.length || 0}`);
    
    // Test 2: Get draft again - should be the same
    console.log('\n2. Getting draft again - should be the same:');
    const draft2 = await draftOrderService.getCurrentDraft(3);
    console.log(`Draft ID: ${draft2.id}, Items: ${draft2.items?.length || 0}`);
    console.log(`Same draft? ${draft1.id === draft2.id}`);
    
    // Test 3: List all draft order items
    console.log('\n3. All draft order items:');
    const allItems = await DraftOrderItem.findAll({
      where: { draft_order_id: draft1.id },
      attributes: ['id', 'product_name', 'quantity', 'unit', 'status']
    });
    
    allItems.forEach(item => {
      console.log(`- Item ${item.id}: ${item.product_name} ${item.quantity} ${item.unit} (${item.status})`);
    });
    
    // Test 4: Check all draft orders for restaurant 1
    console.log('\n4. All draft orders for restaurant 1:');
    const allDrafts = await DraftOrder.findAll({
      where: { restaurant_id: 1 },
      include: ['items']
    });
    
    allDrafts.forEach(draft => {
      console.log(`- Draft ${draft.id}: status=${draft.status}, items=${draft.items?.length || 0}, created=${draft.created_at}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sequelize.close();
  }
}

test();