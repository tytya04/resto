const { DraftOrder, DraftOrderItem, sequelize } = require('./src/database/models');

async function cleanupEmptyDrafts() {
  const transaction = await sequelize.transaction();
  
  try {
    // Находим все черновики без позиций
    const emptyDrafts = await DraftOrder.findAll({
      include: [{
        model: DraftOrderItem,
        as: 'draftOrderItems'
      }],
      where: {
        status: 'draft'
      },
      transaction
    });
    
    let deletedCount = 0;
    
    for (const draft of emptyDrafts) {
      // Удаляем только те черновики, у которых нет позиций
      if (!draft.draftOrderItems || draft.draftOrderItems.length === 0) {
        await draft.destroy({ transaction });
        deletedCount++;
        console.log(`Удален пустой черновик ID: ${draft.id}`);
      }
    }
    
    await transaction.commit();
    console.log(`Всего удалено пустых черновиков: ${deletedCount}`);
    
  } catch (error) {
    await transaction.rollback();
    console.error('Ошибка:', error);
  } finally {
    process.exit(0);
  }
}

cleanupEmptyDrafts();