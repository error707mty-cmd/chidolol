import { db } from "./src/db.js";
import { usersTable, posCustomersTable, posPriceTiersTable, businessConfigTable } from "./src/schema/index.js";
import bcrypt from "bcryptjs";

async function seed() {
  console.log("🌱 Iniciando seed de la base de datos...");

  try {
    // 1. Crear usuario admin
    console.log("👤 Creando usuario admin...");
    const hashedPassword = await bcrypt.hash("buentello0607", 10);
    
    const [admin] = await db.insert(usersTable).values({
      username: "error707mty",
      email: "admin@dtfpos.com",
      passwordHash: hashedPassword,
      displayName: "Administrador",
      isAdmin: true,
    }).returning().catch(() => [null]);

    if (admin) {
      console.log("✅ Usuario admin creado");
      console.log("   Username: error707mty");
      console.log("   Password: buentello0607");
    } else {
      console.log("⚠️  Usuario admin ya existe");
    }

    // 2. Configurar tiers de precios
    console.log("\n💰 Creando tiers de precios...");
    const tiers = [
      { tierName: "normal", pricePerMeter: "30.00" },
      { tierName: "revendedor", pricePerMeter: "25.00" },
      { tierName: "especial", pricePerMeter: "20.00" },
    ];

    for (const tier of tiers) {
      await db.insert(posPriceTiersTable).values(tier).onConflictDoNothing();
    }
    console.log("✅ Tiers de precios creados");

    // 3. Crear clientes de ejemplo
    console.log("\n👥 Creando clientes de ejemplo...");
    const customers = [
      {
        name: "Cliente General",
        priceType: "normal",
        email: "general@example.com",
        phone: "0000000000",
      },
      {
        name: "Revendedor Premium",
        priceType: "revendedor",
        email: "revendedor@example.com",
        phone: "5551234567",
      },
    ];

    for (const customer of customers) {
      await db.insert(posCustomersTable).values(customer).onConflictDoNothing();
    }
    console.log("✅ Clientes de ejemplo creados");

    // 4. Configuración del negocio
    console.log("\n⚙️  Creando configuración del negocio...");
    await db.insert(businessConfigTable).values({
      businessName: "DTF Pliego",
      address: "Av. Principal #123, Col. Centro",
      phone: "8112345678",
      email: "contacto@dtfpliego.com",
      ticketHeader: "¡Gracias por tu compra!",
      ticketFooter: "Conserva tu ticket para cualquier aclaración",
    }).onConflictDoNothing();
    console.log("✅ Configuración del negocio creada");

    console.log("\n🎉 ¡Seed completado exitosamente!");
    console.log("\n📋 Credenciales de acceso:");
    console.log("   URL: http://localhost:3000/admin/pos");
    console.log("   Username: error707mty");
    console.log("   Password: buentello0607");

  } catch (error) {
    console.error("❌ Error en seed:", error);
    throw error;
  } finally {
    process.exit(0);
  }
}

seed();
