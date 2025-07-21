require('dotenv').config();
const { DraftOrder, DraftOrderItem, NomenclatureCache, sequelize } = require('../src/database/models');

async function viewDraft6() {
  try {
    const draft = await DraftOrder.findByPk(6, {
      include: [
        {
          model: DraftOrderItem,
          as: 'items',
          include: [{
            model: NomenclatureCache,
            as: 'matchedProduct'
          }]
        }
      ]
    });
    
    console.log('Draft Order 6:');
    console.log(`- ID: ${draft.id}`);
    console.log(`- Restaurant: ${draft.restaurant_id}`);
    console.log(`- Status: ${draft.status}`);
    console.log(`- Items: ${draft.items?.length || 0}`);
    console.log('\nItems:');
    
    draft.items?.forEach(item => {
      console.log(`  - ${item.product_name} ${item.quantity} ${item.unit} (status: ${item.status})`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sequelize.close();
  }
}

viewDraft6();