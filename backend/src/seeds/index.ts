import { sql, initializeDatabase } from '../database.js';
import dotenv from 'dotenv';

dotenv.config();

const descriptions = [
  'Vestido', 'Vestido Longo', 'Vestido Midi', 'Vestido Curto',
  'Blusa', 'Blusa de Alça', 'Blusa Cropped', 'Regata',
  'Camiseta', 'Camisa', 'Body', 'Top',
  'Calça', 'Calça Jeans', 'Calça Alfaiataria', 'Legging',
  'Shorts', 'Bermuda', 'Saia', 'Saia Midi', 'Saia Longa',
  'Blazer', 'Jaqueta', 'Casaco', 'Cardigan', 'Moletom', 'Colete',
  'Macacão', 'Macaquinho', 'Jardineira', 'Conjunto',
  'Cropped', 'Pantalona', 'Kimono',
  'Bolsa', 'Mochila', 'Clutch', 'Carteira',
  'Tênis', 'Sandália', 'Sapato', 'Bota', 'Ankle Boot', 'Rasteirinha', 'Salto',
  'Óculos de Sol', 'Cinto', 'Lenço', 'Echarpe', 'Pashmina',
  'Brinco', 'Colar', 'Pulseira', 'Anel', 'Bijuteria', 'Relógio',
  'Chapéu', 'Boné', 'Boina'
];

const colors = [
  'Preto', 'Branco', 'Off White', 'Cru', 'Bege', 'Nude', 'Caramelo', 'Marrom', 'Café',
  'Rosa', 'Rosa Claro', 'Rosa Escuro', 'Pink', 'Magenta', 'Salmão', 'Coral',
  'Vermelho', 'Vinho', 'Bordô', 'Marsala',
  'Laranja', 'Terracota', 'Ferrugem',
  'Amarelo', 'Mostarda', 'Dourado', 'Ouro',
  'Verde', 'Verde Claro', 'Verde Escuro', 'Verde Musgo', 'Verde Militar', 'Verde Água', 'Menta',
  'Azul', 'Azul Claro', 'Azul Marinho', 'Azul Royal', 'Azul Bebê', 'Turquesa', 'Ciano',
  'Roxo', 'Lilás', 'Lavanda', 'Violeta', 'Uva',
  'Cinza', 'Cinza Claro', 'Chumbo', 'Grafite', 'Prata',
  'Estampado', 'Listrado', 'Xadrez', 'Poá', 'Floral', 'Animal Print', 'Oncinha', 'Zebra',
  'Tie Dye', 'Degradê', 'Colorido', 'Multicolorido',
  'Jeans Claro', 'Jeans Médio', 'Jeans Escuro'
];

const sizesRoupas = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XXG', 'VESTE P', 'VESTE M', 'VESTE G'];
const sizesNumericos = ['34', '36', '38', '40', '42', '44', '46', '48', '50', '52'];
const sizesCalcados = ['33', '34', '35', '36', '37', '38', '39', '40', '41', '42', '43'];
const sizesUnicos = ['U', 'Único'];

const brands = [
  'Zara', 'H&M', 'Forever 21', 'Renner', 'C&A', 'Riachuelo', 'Marisa',
  'Farm', 'Animale', 'Maria Filó', 'Cantão', 'Dress To', 'Le Lis Blanc',
  'Morena Rosa', 'Colcci', 'Lança Perfume', 'John John', 'Ellus',
  'Maria Valentina', 'Shoulder', 'Bo.Bô', 'NK Store',
  'Adidas', 'Nike', 'Puma', 'Fila', 'Vans', 'Converse', 'New Balance',
  'Arezzo', 'Schutz', 'Luiza Barcelos', 'Santa Lolla', 'Vizzano', 'Bebecê',
  'Calvin Klein', 'Tommy Hilfiger', 'Lacoste', 'Ralph Lauren',
  'Shein', 'Aliexpress', 'SM', 'Pool', 'Hering', 'Malwee',
  'Zattini', 'Dafiti', 'Amaro', 'Posthaus',
  'Doce Trama', 'Lisamour', 'Blusas & Cia', 'Lunender',
  'Chocris', 'Arazzo', 'Ziann', 'Lez a Lez', 'Bluesteel',
  'Ray-Ban', 'Oakley', 'Chilli Beans', 'Dior', 'Gucci', 'Prada', 'Louis Vuitton',
  'Michael Kors', 'Victor Hugo', 'Arezzo', 'Schutz'
];

async function seed() {
  console.log('Iniciando seed do banco de dados...');

  try {
    // Inicializar banco (criar tabelas se não existirem)
    await initializeDatabase();

    // Inserir descrições
    console.log('Inserindo descrições...');
    for (const desc of descriptions) {
      await sql`INSERT INTO descriptions (nome) VALUES (${desc}) ON CONFLICT (nome) DO NOTHING`;
    }

    // Inserir cores
    console.log('Inserindo cores...');
    for (const cor of colors) {
      await sql`INSERT INTO colors (nome) VALUES (${cor}) ON CONFLICT (nome) DO NOTHING`;
    }

    // Inserir tamanhos de roupas
    console.log('Inserindo tamanhos...');
    for (const size of sizesRoupas) {
      await sql`INSERT INTO sizes (nome, categoria) VALUES (${size}, 'roupa') ON CONFLICT (nome, categoria) DO NOTHING`;
    }
    for (const size of sizesNumericos) {
      await sql`INSERT INTO sizes (nome, categoria) VALUES (${size}, 'roupa') ON CONFLICT (nome, categoria) DO NOTHING`;
    }
    for (const size of sizesCalcados) {
      await sql`INSERT INTO sizes (nome, categoria) VALUES (${size}, 'calcado') ON CONFLICT (nome, categoria) DO NOTHING`;
    }
    for (const size of sizesUnicos) {
      await sql`INSERT INTO sizes (nome, categoria) VALUES (${size}, 'unico') ON CONFLICT (nome, categoria) DO NOTHING`;
    }

    // Inserir marcas
    console.log('Inserindo marcas...');
    for (const brand of brands) {
      await sql`INSERT INTO brands (nome) VALUES (${brand}) ON CONFLICT (nome) DO NOTHING`;
    }

    // Inserir vendedora padrão
    console.log('Inserindo vendedora padrão...');
    await sql`
      INSERT INTO sellers (nome, comissao_percentual)
      VALUES ('Vendedora Padrão', 10.00)
      ON CONFLICT DO NOTHING
    `;

    console.log('Seed concluído com sucesso!');
  } catch (error) {
    console.error('Erro durante o seed:', error);
    throw error;
  }
}

// Executar seed
seed()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
