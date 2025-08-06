const { User } = require("./src/database/models");

async function checkUsers() {
  try {
    console.log("=== Проверяем пользователей ===\\n");
    
    const users = await User.findAll({
      attributes: ["id", "first_name", "last_name", "role"],
      order: [["role", "ASC"]]
    });
    
    console.log("Все пользователи:");
    users.forEach(user => {
      console.log(`- ID ${user.id}: ${user.first_name} ${user.last_name || ""} (${user.role})`);
    });
    
  } catch (error) {
    console.error("Ошибка:", error);
  } finally {
    process.exit(0);
  }
}

checkUsers();
